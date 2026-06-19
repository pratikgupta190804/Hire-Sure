package com.nocode.service;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.CreateContainerResponse;
import com.github.dockerjava.api.command.ExecCreateCmdResponse;
import com.github.dockerjava.api.model.*;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Logger;

/**
 * Docker-based code execution engine with a warm container pool.
 *
 * Instead of create→start→exec→destroy per submission (~1.5–3 s), we keep
 * one long-running container per language alive and route submissions through
 * `docker exec`.  Cold-start cost is paid once at boot; subsequent runs cost
 * only the actual program runtime (~50–200 ms).
 *
 * Container lifecycle
 * ───────────────────
 *  • At startup, one container per active Language is created and started.
 *  • Each container tracks its run count via an AtomicInteger.
 *  • When runCount reaches REFRESH_AFTER_RUNS the container is replaced
 *    asynchronously: the new one is fully started before the old one is
 *    destroyed, so there is never a gap in availability.
 *  • A per-language semaphore (pool size = POOL_CONCURRENCY) prevents
 *    concurrent execs from interfering with each other's filesystem writes.
 *  • If a warm container is somehow unavailable (crash, OOM) the pool
 *    recreates it before returning an error to the caller.
 */
@Service
@ConditionalOnProperty(name = "execution.enabled", havingValue = "true", matchIfMissing = true)
public class CodeExecutionEngine implements ExecutionService {

    private static final Logger log = Logger.getLogger(CodeExecutionEngine.class.getName());

    // How many execs to allow before recycling the container for cleanliness.
    private static final int REFRESH_AFTER_RUNS = 50;

    // Max concurrent execs inside a single warm container (1 = fully serialised per language).
    // Increase if you want parallelism at the cost of noisier resource sharing.
    private static final int POOL_CONCURRENCY = 1;

    @Value("${execution.time-limit-seconds:5}")
    private int timeLimitSeconds;

    @Value("${execution.memory-limit-mb:256}")
    private int memoryLimitMb;

    private DockerClient dockerClient;

    /**
     * One slot per language: the currently warm container + its concurrency guard.
     */
    private final Map<Language, WarmContainer> pool = new ConcurrentHashMap<>();

    /**
     * Dedicated thread pool for async container refresh so it never ties up
     * a Tomcat request thread.
     */
    private final ExecutorService refreshExecutor =
            Executors.newCachedThreadPool(r -> {
                Thread t = new Thread(r, "container-refresh");
                t.setDaemon(true);
                return t;
            });

    // ── Warm container record ─────────────────────────────────────────────────

    /**
     * Holds a running container ID together with its run counter and a
     * semaphore that serialises (or limits) concurrent execs.
     */
    private static class WarmContainer {
        volatile String containerId;
        final AtomicInteger runCount = new AtomicInteger(0);
        final Semaphore semaphore = new Semaphore(POOL_CONCURRENCY, true);
        final Language language;
        volatile boolean needsRefresh = false;

        WarmContainer(String containerId, Language language) {
            this.containerId = containerId;
            this.language    = language;
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @PostConstruct
    public void init() {
        DefaultDockerClientConfig config = DefaultDockerClientConfig
                .createDefaultConfigBuilder()
                .build();

        ApacheDockerHttpClient httpClient = new ApacheDockerHttpClient.Builder()
                .dockerHost(config.getDockerHost())
                .sslConfig(config.getSSLConfig())
                .maxConnections(50)
                .connectionTimeout(Duration.ofSeconds(10))
                .responseTimeout(Duration.ofSeconds(30))
                .build();

        dockerClient = DockerClientImpl.getInstance(config, httpClient);
        dockerClient.pingCmd().exec();

        // Pre-warm one container per supported language.
        for (Language lang : Language.values()) {
            try {
                pullImageIfNeeded(lang.getDockerImage());
                WarmContainer wc = createWarmContainer(lang);
                pool.put(lang, wc);
                log.info(String.format("Warm container ready [%s] → %s", lang.name(), wc.containerId));
            } catch (Exception e) {
                // Non-fatal: the language simply won't be available until Docker recovers.
                log.warning(String.format("Failed to warm container for %s: %s", lang.name(), e.getMessage()));
            }
        }
    }

    @PreDestroy
    public void destroy() {
        pool.forEach((lang, wc) -> forceRemoveContainer(wc.containerId));
        pool.clear();
        refreshExecutor.shutdownNow();
        try {
            if (dockerClient != null) dockerClient.close();
        } catch (IOException ignored) {}
    }

    // ── Public execute API ────────────────────────────────────────────────────

    @Override
    public ExecutionResult execute(String sourceCode, int languageId, String stdin) {
        Language lang;
        try {
            lang = Language.fromId(languageId);
        } catch (IllegalArgumentException e) {
            return ExecutionResult.builder()
                    .stderr("Unsupported language ID: " + languageId)
                    .exitCode(1)
                    .build();
        }

        WarmContainer wc = pool.computeIfAbsent(lang, l -> {
            try { return createWarmContainer(l); }
            catch (Exception ex) { throw new RuntimeException(ex); }
        });

        // Acquire concurrency permit before touching the container filesystem.
        try {
            wc.semaphore.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return ExecutionResult.builder().stderr("Interrupted waiting for execution slot").exitCode(1).build();
        }

        try {
            return executeInWarmContainer(wc, sourceCode, stdin, lang);
        } finally {
            wc.semaphore.release();
            maybeScheduleRefresh(lang, wc);
        }
    }

    @Override
    public List<ExecutionResult> executeBatch(String sourceCode, int languageId, List<String> stdins) {
        Language lang;
        try {
            lang = Language.fromId(languageId);
        } catch (IllegalArgumentException e) {
            return List.of(ExecutionResult.builder()
                    .stderr("Unsupported language ID: " + languageId)
                    .exitCode(1)
                    .build());
        }

        WarmContainer wc = pool.computeIfAbsent(lang, l -> {
            try { return createWarmContainer(l); }
            catch (Exception ex) { throw new RuntimeException(ex); }
        });

        // Acquire concurrency permit before touching the container filesystem.
        try {
            wc.semaphore.acquire();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return List.of(ExecutionResult.builder().stderr("Interrupted waiting for execution slot").exitCode(1).build());
        }

        try {
            return executeBatchInWarmContainer(wc, sourceCode, stdins, lang);
        } finally {
            wc.semaphore.release();
            maybeScheduleRefresh(lang, wc);
        }
    }

    private List<ExecutionResult> executeBatchInWarmContainer(WarmContainer wc,
                                                             String sourceCode,
                                                             List<String> stdins,
                                                             Language lang) {
        List<ExecutionResult> results = new ArrayList<>();
        String runId  = UUID.randomUUID().toString().substring(0, 8);
        String runDir = "/workspace/run-" + runId;
        try {

            // 1. Create isolated run directory and write source code.
            execSilent(wc.containerId, new String[]{"mkdir", "-p", runDir});
            writeFileToContainer(wc.containerId, runDir + "/" + lang.getFileName(), sourceCode);

            // 2. Compile step (compile EXACTLY ONCE).
            if (lang.isCompiled()) {
                String compileCmd = "cd " + runDir + " && " + lang.getCompileCmd();
                ExecResult compileResult = execWithOutput(
                        wc.containerId, new String[]{"sh", "-c", compileCmd}, 30);

                if (compileResult.exitCode != 0) {
                    return List.of(ExecutionResult.builder()
                            .compileOutput(compileResult.stderr.isEmpty()
                                    ? compileResult.stdout : compileResult.stderr)
                            .stderr(compileResult.stderr)
                            .exitCode(compileResult.exitCode)
                            .build());
                }
            }

            // Java: pre-fetch compilation class bytes so we don't do it inside the loop
            String javaBase64Bytes = null;
            if (lang == Language.JAVA) {
                String classPath = runDir + "/Main.class";
                ExecResult base64Result = execWithOutput(
                        wc.containerId, new String[]{"base64", classPath}, 10);
                if (base64Result.exitCode != 0) {
                    return List.of(ExecutionResult.builder()
                            .stderr("Failed to read compiled class: " + base64Result.stderr)
                            .exitCode(1)
                            .build());
                }
                javaBase64Bytes = base64Result.stdout.trim().replace("\n", "").replace("\r", "");
            }

            // 3. Sequential run step for each input
            for (String stdin : stdins) {
                if (lang == Language.JAVA) {
                    long startRunMs = System.currentTimeMillis();
                    ExecutionResult jvmResult = runJvmRunner(wc.containerId, runDir, javaBase64Bytes, stdin, timeLimitSeconds);
                    long runtimeMs = System.currentTimeMillis() - startRunMs;

                    if (jvmResult.isTimedOut()) {
                        wc.needsRefresh = true;
                        results.add(ExecutionResult.builder()
                                .stdout(jvmResult.getStdout())
                                .stderr("Time limit exceeded")
                                .exitCode(124)
                                .runtimeMs(runtimeMs)
                                .timedOut(true)
                                .build());
                        break;
                    }

                    results.add(ExecutionResult.builder()
                            .stdout(jvmResult.getStdout())
                            .stderr(jvmResult.getStderr())
                            .exitCode(jvmResult.getExitCode())
                            .runtimeMs(runtimeMs)
                            .build());

                    if (jvmResult.getExitCode() != 0) {
                        break; // Stop running remaining testcases on runtime error
                    }
                } else {
                    writeFileToContainer(wc.containerId, runDir + "/.stdin", stdin != null ? stdin : "");

                    String runCmd = "cd " + runDir + " && " + lang.getRunCmd() + " < .stdin";
                    long startRunMs = System.currentTimeMillis();
                    ExecResult runResult = execWithOutput(
                            wc.containerId, new String[]{"sh", "-c", runCmd}, timeLimitSeconds);
                    long runtimeMs = System.currentTimeMillis() - startRunMs;

                    if (runResult.timedOut) {
                        results.add(ExecutionResult.builder()
                                .stdout(runResult.stdout)
                                .stderr("Time limit exceeded")
                                .exitCode(124)
                                .runtimeMs(runtimeMs)
                                .timedOut(true)
                                .build());
                        break;
                    }

                    results.add(ExecutionResult.builder()
                            .stdout(runResult.stdout)
                            .stderr(runResult.stderr)
                            .exitCode(runResult.exitCode)
                            .runtimeMs(runtimeMs)
                            .build());

                    if (runResult.exitCode != 0) {
                        break; // Stop running remaining testcases on runtime error
                    }
                }
            }

        } catch (Exception e) {
            results.add(ExecutionResult.builder()
                    .stderr("Execution error: " + e.getMessage())
                    .exitCode(1)
                    .build());
        } finally {
            // Asynchronous cleanup of run directory so it doesn't block the critical path
            final String containerId = wc.containerId;
            final String targetRunDir = runDir;
            refreshExecutor.submit(() -> {
                try {
                    execSilent(containerId, new String[]{"rm", "-rf", targetRunDir});
                } catch (Exception ignored) {}
            });
        }

        return results;
    }

    // ── Core exec logic ───────────────────────────────────────────────────────

    /**
     * Copy source into the warm container's /workspace and run it via docker exec.
     * No create/start/destroy — just a single exec call per submission.
     */
    private ExecutionResult executeInWarmContainer(WarmContainer wc,
                                                   String sourceCode,
                                                   String stdin,
                                                   Language lang) {
        long startMs = System.currentTimeMillis();

        try {
            // Use a unique subdirectory per run so concurrent runs don't clash
            // even if POOL_CONCURRENCY > 1 in the future.
            String runId  = UUID.randomUUID().toString().substring(0, 8);
            String runDir = "/workspace/run-" + runId;

            // 1. Create isolated run directory and write source + stdin atomically.
            execSilent(wc.containerId, new String[]{"mkdir", "-p", runDir});

            writeFileToContainer(wc.containerId, runDir + "/" + lang.getFileName(), sourceCode);
            writeFileToContainer(wc.containerId, runDir + "/.stdin", stdin != null ? stdin : "");

            // 2. Compile step for compiled languages.
            if (lang.isCompiled()) {
                String compileCmd = "cd " + runDir + " && " + lang.getCompileCmd();
                ExecResult compileResult = execWithOutput(
                        wc.containerId, new String[]{"sh", "-c", compileCmd}, 30);

                if (compileResult.exitCode != 0) {
                    return ExecutionResult.builder()
                            .compileOutput(compileResult.stderr.isEmpty()
                                    ? compileResult.stdout : compileResult.stderr)
                            .stderr(compileResult.stderr)
                            .exitCode(compileResult.exitCode)
                            .build();
                }
            }

            // 3. Run step.
            if (lang == Language.JAVA) {
                String classPath = runDir + "/Main.class";
                ExecResult base64Result = execWithOutput(
                        wc.containerId, new String[]{"base64", classPath}, 10);
                if (base64Result.exitCode != 0) {
                    return ExecutionResult.builder()
                            .stderr("Failed to read compiled class: " + base64Result.stderr)
                            .exitCode(1)
                            .build();
                }
                String base64Bytes = base64Result.stdout.trim().replace("\n", "").replace("\r", "");

                long startRunMs = System.currentTimeMillis();
                ExecutionResult jvmResult = runJvmRunner(wc.containerId, runDir, base64Bytes, stdin, timeLimitSeconds);
                long runtimeMs = System.currentTimeMillis() - startRunMs;

                if (jvmResult.isTimedOut()) {
                    wc.needsRefresh = true;
                    return ExecutionResult.builder()
                            .stdout(jvmResult.getStdout())
                            .stderr("Time limit exceeded")
                            .exitCode(124)
                            .runtimeMs(runtimeMs)
                            .timedOut(true)
                            .build();
                }

                return ExecutionResult.builder()
                        .stdout(jvmResult.getStdout())
                        .stderr(jvmResult.getStderr())
                        .exitCode(jvmResult.getExitCode())
                        .runtimeMs(runtimeMs)
                        .build();
            } else {
                String runCmd = "cd " + runDir + " && " + lang.getRunCmd() + " < .stdin";
                ExecResult runResult = execWithOutput(
                        wc.containerId, new String[]{"sh", "-c", runCmd}, timeLimitSeconds);

                long runtimeMs = System.currentTimeMillis() - startMs;

                if (runResult.timedOut) {
                    return ExecutionResult.builder()
                            .stdout(runResult.stdout)
                            .stderr("Time limit exceeded")
                            .exitCode(124)
                            .runtimeMs(runtimeMs)
                            .timedOut(true)
                            .build();
                }

                return ExecutionResult.builder()
                        .stdout(runResult.stdout)
                        .stderr(runResult.stderr)
                        .exitCode(runResult.exitCode)
                        .runtimeMs(runtimeMs)
                        .build();
            }

        } catch (Exception e) {
            return ExecutionResult.builder()
                    .stderr("Execution error: " + e.getMessage())
                    .exitCode(1)
                    .build();
        } finally {
            // Best-effort cleanup of the run directory; don't block on failure.
            try {
                execSilent(wc.containerId,
                        new String[]{"sh", "-c", "rm -rf /workspace/run-*"});
            } catch (Exception ignored) {}
        }
    }

    private ExecutionResult runJvmRunner(String containerId, String runDir, String base64Class, String stdin, int timeoutSeconds) {
        String stdinBase64 = stdin != null ? Base64.getEncoder().encodeToString(stdin.getBytes(StandardCharsets.UTF_8)) : "";
        String payload = base64Class + "\n" + stdinBase64 + "\n";

        try {
            writeFileToContainer(containerId, runDir + "/.payload", payload);

            String[] cmd = new String[]{"sh", "-c", "cat /workspace/output.pipe & PID=$!; cat " + runDir + "/.payload > /workspace/input.pipe; wait $PID"};
            ExecResult runResult = execWithOutput(containerId, cmd, timeoutSeconds);

            if (runResult.timedOut) {
                return ExecutionResult.builder()
                        .stderr("Time limit exceeded")
                        .exitCode(124)
                        .timedOut(true)
                        .build();
            }

            return parseRunnerResponse(runResult.stdout);
        } catch (Exception e) {
            return ExecutionResult.builder().stderr("Error communicating with Warm JVM: " + e.getMessage()).exitCode(1).build();
        }
    }

    private ExecutionResult parseRunnerResponse(String output) throws Exception {
        String normalized = output.replace("\r", "");
        String[] lines = normalized.split("\n", -1);
        if (lines.length < 3) {
            throw new IOException("Invalid response from JVM runner: " + output);
        }
        int exitCode = Integer.parseInt(lines[0].trim());
        byte[] stdoutBytes = Base64.getDecoder().decode(lines[1].trim());
        byte[] stderrBytes = Base64.getDecoder().decode(lines[2].trim());

        return ExecutionResult.builder()
                .stdout(new String(stdoutBytes, StandardCharsets.UTF_8))
                .stderr(new String(stderrBytes, StandardCharsets.UTF_8))
                .exitCode(exitCode)
                .build();
    }

    // ── docker exec helpers ───────────────────────────────────────────────────

    /**
     * Lightweight record returned by execWithOutput.
     */
    private static class ExecResult {
        final String  stdout;
        final String  stderr;
        final int     exitCode;
        final boolean timedOut;

        ExecResult(String stdout, String stderr, int exitCode, boolean timedOut) {
            this.stdout   = stdout;
            this.stderr   = stderr;
            this.exitCode = exitCode;
            this.timedOut = timedOut;
        }
    }

    /**
     * Run a command inside an already-running container and capture output.
     * Blocks until the exec finishes or timeoutSeconds elapses.
     */
    private ExecResult execWithOutput(String containerId, String[] cmd,
                                      int timeoutSeconds) throws InterruptedException {
        ExecCreateCmdResponse exec = dockerClient.execCreateCmd(containerId)
                .withCmd(cmd)
                .withAttachStdout(true)
                .withAttachStderr(true)
                .withAttachStdin(false)
                .exec();

        StringBuilder stdout = new StringBuilder();
        StringBuilder stderr = new StringBuilder();
        CountDownLatch latch = new CountDownLatch(1);

        dockerClient.execStartCmd(exec.getId())
                .exec(new ResultCallback.Adapter<Frame>() {
                    @Override public void onNext(Frame frame) {
                        String text = new String(frame.getPayload(), StandardCharsets.UTF_8);
                        if (frame.getStreamType() == StreamType.STDOUT) stdout.append(text);
                        else stderr.append(text);
                    }
                    @Override public void onComplete() { latch.countDown(); }
                    @Override public void onError(Throwable t) { latch.countDown(); }
                });

        boolean finished = latch.await(timeoutSeconds, TimeUnit.SECONDS);

        if (!finished) {
            // Kill the exec process inside the container.
            try {
                execSilent(containerId, new String[]{"sh", "-c",
                        "kill $(cat /tmp/exec.pid 2>/dev/null) 2>/dev/null; true"});
            } catch (Exception ignored) {}
            return new ExecResult(stdout.toString(), stderr.toString(), 124, true);
        }

        int exitCode = dockerClient.inspectExecCmd(exec.getId()).exec()
                .getExitCodeLong().intValue();

        return new ExecResult(stdout.toString(), stderr.toString(), exitCode, false);
    }

    /**
     * Fire-and-forget exec — used for mkdir, rm, and other housekeeping.
     * Errors are swallowed deliberately.
     */
    private void execSilent(String containerId, String[] cmd) {
        try {
            ExecCreateCmdResponse exec = dockerClient.execCreateCmd(containerId)
                    .withCmd(cmd)
                    .withAttachStdout(false)
                    .withAttachStderr(false)
                    .exec();
            dockerClient.execStartCmd(exec.getId())
                    .exec(new ResultCallback.Adapter<>())
                    .awaitCompletion(5, TimeUnit.SECONDS);
        } catch (Exception ignored) {}
    }

    /**
     * Write a string into a running container using docker cp (tar stream).
     *
     * docker exec + stdin attachment races against stream setup in the Java SDK
     * and is unreliable for file writes. docker cp is the correct API: it copies
     * an in-memory tar archive directly into the container filesystem with no
     * timing dependency.
     *
     * @param containerId  target container
     * @param path         absolute path inside the container (e.g. /workspace/run-x/Main.java)
     * @param content      file content as a string
     */
    private void writeFileToContainer(String containerId, String path,
                                      String content) throws Exception {
        byte[] contentBytes = content.getBytes(StandardCharsets.UTF_8);

        // Build a minimal tar archive in memory: one entry for the target file.
        String   fileName  = path.substring(path.lastIndexOf('/') + 1);
        String   targetDir = path.substring(0, path.lastIndexOf('/'));
        byte[]   tarBytes  = buildTar(fileName, contentBytes);

        dockerClient.copyArchiveToContainerCmd(containerId)
                .withTarInputStream(new ByteArrayInputStream(tarBytes))
                .withRemotePath(targetDir)
                .exec();
    }

    /**
     * Build a minimal POSIX tar archive in memory containing a single file.
     * The tar header is 512 bytes; data follows in 512-byte blocks.
     */
    private byte[] buildTar(String fileName, byte[] content) throws IOException {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();

        // ── 512-byte POSIX ustar header ──────────────────────────────────────
        byte[] header = new byte[512];

        // File name (bytes 0–99)
        byte[] nameBytes = fileName.getBytes(StandardCharsets.UTF_8);
        System.arraycopy(nameBytes, 0, header, 0, Math.min(nameBytes.length, 99));

        // File mode (bytes 100–107): 0000644
        fillOctal(header, 100, 8, 0644);

        // UID / GID (bytes 108–123): both 0
        fillOctal(header, 108, 8, 0);
        fillOctal(header, 116, 8, 0);

        // File size (bytes 124–135): octal
        fillOctal(header, 124, 12, content.length);

        // Modification time (bytes 136–147): current epoch seconds
        fillOctal(header, 136, 12, System.currentTimeMillis() / 1000);

        // Type flag (byte 156): '0' = regular file
        header[156] = '0';

        // UStar magic (bytes 257–262)
        byte[] magic = "ustar ".getBytes(StandardCharsets.UTF_8);
        System.arraycopy(magic, 0, header, 257, magic.length);

        // Checksum (bytes 148–155): sum of all header bytes with checksum field as spaces
        Arrays.fill(header, 148, 156, (byte) ' ');
        int checksum = 0;
        for (byte b : header) checksum += (b & 0xFF);
        fillOctal(header, 148, 8, checksum);

        baos.write(header);

        // ── File content padded to 512-byte blocks ────────────────────────────
        baos.write(content);
        int remainder = content.length % 512;
        if (remainder != 0) {
            baos.write(new byte[512 - remainder]); // padding
        }

        // ── Two 512-byte zero blocks mark end-of-archive ──────────────────────
        baos.write(new byte[1024]);

        return baos.toByteArray();
    }

    /** Write {@code value} as a zero-padded octal string into {@code buf[offset..offset+len-1]}. */
    private void fillOctal(byte[] buf, int offset, int len, long value) {
        String octal = String.format("%0" + (len - 1) + "o", value);
        byte[] ob = octal.getBytes(StandardCharsets.UTF_8);
        System.arraycopy(ob, 0, buf, offset, Math.min(ob.length, len - 1));
        buf[offset + len - 1] = 0; // null-terminate
    }

    // ── Container creation ────────────────────────────────────────────────────

    /**
     * Create, configure, and start a new long-running sandbox container.
     * The entrypoint is `sleep infinity` so the container stays alive
     * indefinitely and accepts docker exec calls.
     */
    private String readResource(String path) throws IOException {
        try (InputStream in = CodeExecutionEngine.class.getResourceAsStream(path)) {
            if (in == null) throw new FileNotFoundException("Resource not found: " + path);
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private WarmContainer createWarmContainer(Language lang) throws Exception {
        var createCmd = dockerClient.createContainerCmd(lang.getDockerImage())
                .withHostConfig(HostConfig.newHostConfig()
                        .withMemory((long) memoryLimitMb * 1024 * 1024)
                        .withMemorySwap((long) memoryLimitMb * 1024 * 1024)
                        .withCpuPeriod(100000L)
                        .withCpuQuota(50000L)
                        .withNetworkMode("none")
                        .withReadonlyRootfs(false)
                        .withPidsLimit(64L)
                )
                .withLabels(Map.of(
                        "managed-by",  "code-execution-engine",
                        "language",    lang.name()
                ))
                .withWorkingDir("/workspace");

        if (lang == Language.JAVA) {
            createCmd = createCmd.withCmd("java", "-Djava.security.manager=allow", "/workspace/WarmJvmRunner.java");
        } else {
            createCmd = createCmd.withCmd("sleep", "infinity");
        }

        CreateContainerResponse container = createCmd.exec();
        String id = container.getId();

        if (lang == Language.JAVA) {
            // Write WarmJvmRunner.java before starting the container
            String runnerContent = readResource("/WarmJvmRunner.java");
            writeFileToContainer(id, "/workspace/WarmJvmRunner.java", runnerContent);
        }

        dockerClient.startContainerCmd(id).exec();

        // Ensure the workspace directory exists inside the container.
        execSilent(id, new String[]{"mkdir", "-p", "/workspace"});

        return new WarmContainer(id, lang);
    }

    // ── Pool refresh ──────────────────────────────────────────────────────────

    /**
     * After every exec, check whether this container has hit the run threshold.
     * If so, schedule an async blue/green replacement: bring up the new container
     * fully before tearing down the old one so there is zero downtime.
     */
    private void maybeScheduleRefresh(Language lang, WarmContainer wc) {
        int runs = wc.runCount.incrementAndGet();
        if (runs < REFRESH_AFTER_RUNS && !wc.needsRefresh) return;

        log.info(String.format("Scheduling container refresh for %s after %d runs (needsRefresh=%b)", lang.name(), runs, wc.needsRefresh));

        refreshExecutor.submit(() -> {
            WarmContainer fresh = null;
            try {
                fresh = createWarmContainer(lang);
                log.info(String.format("Refresh: new container ready [%s] → %s", lang.name(), fresh.containerId));
            } catch (Exception e) {
                log.warning(String.format("Refresh: failed to create new container for %s: %s",
                        lang.name(), e.getMessage()));
                return; // keep using the old (potentially dirty) container rather than leaving the slot empty
            }

            // Atomically swap — submissions in flight on wc will finish normally
            // because we're only replacing the pool reference; existing WarmContainer
            // object stays valid until the semaphore is fully released.
            WarmContainer old = pool.put(lang, fresh);

            // Drain the old container's semaphore before removing it, so any
            // exec still holding the permit can complete cleanly.
            if (old != null) {
                try {
                    old.semaphore.acquire(POOL_CONCURRENCY);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } finally {
                    forceRemoveContainer(old.containerId);
                    log.info(String.format("Refresh: old container removed [%s] ← %s",
                            lang.name(), old.containerId));
                }
            }
        });
    }

    // ── Image management ──────────────────────────────────────────────────────

    private final Set<String> pulledImages = ConcurrentHashMap.newKeySet();

    private void pullImageIfNeeded(String image) {
        if (pulledImages.contains(image)) return;
        try {
            dockerClient.pullImageCmd(image)
                    .exec(new ResultCallback.Adapter<PullResponseItem>() {
                        @Override public void onNext(PullResponseItem item) {}
                    })
                    .awaitCompletion(5, TimeUnit.MINUTES);
            pulledImages.add(image);
        } catch (Exception e) {
            pulledImages.add(image); // assume it's present locally
        }
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    private void forceRemoveContainer(String containerId) {
        if (containerId == null) return;
        try {
            dockerClient.removeContainerCmd(containerId).withForce(true).exec();
        } catch (Exception ignored) {}
    }
}