package com.nocode.service;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.async.ResultCallback;
import com.github.dockerjava.api.command.CreateContainerResponse;
import com.github.dockerjava.api.model.*;
import com.github.dockerjava.core.DefaultDockerClientConfig;
import com.github.dockerjava.core.DockerClientImpl;
import com.github.dockerjava.httpclient5.ApacheDockerHttpClient;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;

/**
 * Custom Docker-based code execution engine.
 * Replaces Judge0 entirely — no external dependencies, completely free.
 *
 * Flow per submission:
 *  1. Write source code to a temp directory on host
 *  2. Spin a Docker container with that directory mounted
 *  3. If compiled language: run compile step first
 *  4. Run the program with stdin piped in
 *  5. Capture stdout/stderr with a time limit
 *  6. Kill & remove the container
 *  7. Clean up temp directory
 */
@Service
public class CodeExecutionEngine implements ExecutionService {

    @Value("${execution.time-limit-seconds:5}")
    private int timeLimitSeconds;

    @Value("${execution.memory-limit-mb:256}")
    private int memoryLimitMb;

    private DockerClient dockerClient;

    @PostConstruct
    public void init() {
        try {
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
            
            // Test connection
            dockerClient.pingCmd().exec();
        } catch (Exception e) {
            throw new RuntimeException("Failed to connect to Docker daemon. Make sure Docker is running!", e);
        }
    }

    @PreDestroy
    public void destroy() {
        try {
            if (dockerClient != null) dockerClient.close();
        } catch (IOException ignored) {}
    }

    // ── Main entry point ──────────────────────────────────────────────────────

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

        // Pull image if not present (only happens once per image)
        pullImageIfNeeded(lang.getDockerImage());

        Path workDir = null;
        String containerId = null;

        try {
            // 1. Write source code to temp dir
            workDir = Files.createTempDirectory("exec-");
            Path sourceFile = workDir.resolve(lang.getFileName());
            Files.writeString(sourceFile, sourceCode);

            // 2. Compile step (if needed)
            if (lang.isCompiled()) {
                ExecutionResult compileResult = runInContainer(
                        lang.getDockerImage(),
                        lang.getCompileCmd(),
                        "",
                        workDir,
                        30  // compile timeout is generous
                );
                if (!compileResult.isSuccess()) {
                    return ExecutionResult.builder()
                            .compileOutput(compileResult.getStderr() != null
                                    ? compileResult.getStderr()
                                    : compileResult.getStdout())
                            .stderr(compileResult.getStderr())
                            .exitCode(compileResult.getExitCode())
                            .timedOut(compileResult.isTimedOut())
                            .build();
                }
            }

            // 3. Run step
            ExecutionResult result = runInContainer(
                    lang.getDockerImage(),
                    lang.getRunCmd(),
                    stdin != null ? stdin : "",
                    workDir,
                    timeLimitSeconds
            );
            return result;

        } catch (Exception e) {
            return ExecutionResult.builder()
                    .stderr("Internal execution error: " + e.getMessage())
                    .exitCode(1)
                    .build();
        } finally {
            cleanup(workDir);
        }
    }

    // ── Docker container lifecycle ────────────────────────────────────────────

    private ExecutionResult runInContainer(String image, String cmd,
                                           String stdin, Path workDir,
                                           int timeoutSeconds) throws Exception {

        String containerId = null;
        long startMs = System.currentTimeMillis();

        try {
            // Build the shell command: echo stdin | sh -c "cmd"
            // We write stdin to a file and redirect, cleaner than piping
            Path stdinFile = workDir.resolve(".stdin");
            Files.writeString(stdinFile, stdin);

            String fullCmd = String.format("sh -c '%s < /workspace/.stdin'", cmd.replace("'", "'\\''")); 

            // Create container
            CreateContainerResponse container = dockerClient.createContainerCmd(image)
                    .withCmd("sh", "-c", cmd + " < /workspace/.stdin")
                    .withHostConfig(HostConfig.newHostConfig()
                            .withBinds(new Bind(workDir.toAbsolutePath().toString(),
                                    new Volume("/workspace")))
                            .withMemory((long) memoryLimitMb * 1024 * 1024)
                            .withMemorySwap((long) memoryLimitMb * 1024 * 1024) // disable swap
                            .withCpuPeriod(100000L)
                            .withCpuQuota(50000L)   // 50% of one CPU
                            .withNetworkMode("none") // no network access
                            .withReadonlyRootfs(false)
                            .withPidsLimit(64L)     // prevent fork bombs
                    )
                    .withWorkingDir("/workspace")
                    .exec();

            containerId = container.getId();
            
            dockerClient.startContainerCmd(containerId).exec();

            // Capture output
            StringBuilder stdout = new StringBuilder();
            StringBuilder stderr = new StringBuilder();
            CountDownLatch latch = new CountDownLatch(1);

            dockerClient.logContainerCmd(containerId)
                    .withStdOut(true)
                    .withStdErr(true)
                    .withFollowStream(true)
                    .exec(new ResultCallback.Adapter<Frame>() {
                        @Override
                        public void onNext(Frame frame) {
                            String text = new String(frame.getPayload(), StandardCharsets.UTF_8);
                            if (frame.getStreamType() == StreamType.STDOUT) {
                                stdout.append(text);
                            } else {
                                stderr.append(text);
                            }
                        }
                        @Override
                        public void onComplete() { 
                            latch.countDown(); 
                        }
                        @Override
                        public void onError(Throwable t) { 
                            latch.countDown(); 
                        }
                    });

            // Wait for container to finish, with timeout
            boolean finished = latch.await(timeoutSeconds, TimeUnit.SECONDS);
            long runtimeMs = System.currentTimeMillis() - startMs;

            if (!finished) {
                // TLE — kill immediately
                try { dockerClient.killContainerCmd(containerId).exec(); } catch (Exception ignored) {}
                return ExecutionResult.builder()
                        .stdout(stdout.toString())
                        .stderr("Time limit exceeded")
                        .exitCode(124)
                        .runtimeMs(runtimeMs)
                        .timedOut(true)
                        .build();
            }

            // Get exit code
            int exitCode = dockerClient.inspectContainerCmd(containerId).exec()
                    .getState().getExitCodeLong().intValue();

            // Check OOM
            boolean oomKilled = Boolean.TRUE.equals(
                    dockerClient.inspectContainerCmd(containerId).exec()
                            .getState().getOOMKilled());

            return ExecutionResult.builder()
                    .stdout(stdout.toString())
                    .stderr(stderr.toString())
                    .exitCode(exitCode)
                    .runtimeMs(runtimeMs)
                    .oomKilled(oomKilled)
                    .build();

        } catch (Exception e) {
            throw e;
        } finally {
            // Always remove the container
            if (containerId != null) {
                try {
                    dockerClient.removeContainerCmd(containerId).withForce(true).exec();
                } catch (Exception ignored) {
                }
            }
        }
    }

    // ── Image management ──────────────────────────────────────────────────────

    private final Set<String> pulledImages = ConcurrentHashMap.newKeySet();

    private void pullImageIfNeeded(String image) {
        if (pulledImages.contains(image)) {
            return;
        }
        try {
            dockerClient.pullImageCmd(image)
                    .exec(new ResultCallback.Adapter<PullResponseItem>() {
                        @Override
                        public void onNext(PullResponseItem item) {
                        }
                    })
                    .awaitCompletion(5, TimeUnit.MINUTES);
            pulledImages.add(image);
        } catch (Exception e) {
            pulledImages.add(image); // assume it's there
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    private void cleanup(Path workDir) {
        if (workDir == null) return;
        try {
            try (var stream = Files.walk(workDir)) {
                stream.sorted(Comparator.reverseOrder())
                        .forEach(p -> {
                            try { Files.delete(p); } catch (IOException ignored) {}
                        });
            }
        } catch (IOException ignored) {}
    }
}