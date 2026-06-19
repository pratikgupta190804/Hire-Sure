import java.io.*;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Base64;

public class WarmJvmRunner {

    public static class ExitException extends SecurityException {
        public final int status;
        public ExitException(int status) {
            super("Exit blocked: " + status);
            this.status = status;
        }
    }

    public static class CustomClassLoader extends ClassLoader {
        private final byte[] classBytes;

        public CustomClassLoader(ClassLoader parent, byte[] classBytes) {
            super(parent);
            this.classBytes = classBytes;
        }

        @Override
        protected Class<?> findClass(String name) throws ClassNotFoundException {
            if ("Main".equals(name)) {
                return defineClass(name, classBytes, 0, classBytes.length);
            }
            return super.findClass(name);
        }
    }

    public static void main(String[] args) {
        // 1. Set SecurityManager to prevent System.exit() from terminating the runner process
        try {
            System.setSecurityManager(new SecurityManager() {
                @Override
                public void checkExit(int status) {
                    throw new ExitException(status);
                }
                @Override
                public void checkPermission(java.security.Permission perm) {
                    // Allow everything else
                }
            });
        } catch (UnsupportedOperationException e) {
            System.err.println("Warning: SecurityManager could not be set. System.exit() may stop the container.");
        }

        // 2. Create the named pipes if they do not exist
        try {
            Runtime.getRuntime().exec(new String[]{"mkfifo", "/workspace/input.pipe", "/workspace/output.pipe"}).waitFor();
        } catch (Exception e) {
            System.err.println("Failed to create named pipes: " + e.getMessage());
        }

        // 3. Persistent execution loop
        while (true) {
            try (BufferedReader reader = new BufferedReader(new FileReader("/workspace/input.pipe"))) {
                // Read base64 class bytes
                String classBase64 = reader.readLine();
                if (classBase64 == null) continue;

                // Read base64 user stdin
                String stdinBase64 = reader.readLine();
                if (stdinBase64 == null) stdinBase64 = "";

                byte[] classBytes = Base64.getDecoder().decode(classBase64.trim());
                byte[] stdinBytes = Base64.getDecoder().decode(stdinBase64.trim());

                // Run execution in-memory
                executeClass(classBytes, stdinBytes);

            } catch (Throwable t) {
                // If any error occurred, write an error response
                try (OutputStream out = new FileOutputStream("/workspace/output.pipe")) {
                    writeResponse(out, 1, new byte[0], t.toString().getBytes("UTF-8"));
                } catch (Exception ignored) {}
            }
        }
    }

    private static void executeClass(byte[] classBytes, byte[] stdinBytes) throws Exception {
        InputStream origIn = System.in;
        PrintStream origOut = System.out;
        PrintStream origErr = System.err;

        ByteArrayInputStream testIn = new ByteArrayInputStream(stdinBytes);
        ByteArrayOutputStream testOut = new ByteArrayOutputStream();
        ByteArrayOutputStream testErr = new ByteArrayOutputStream();

        System.setIn(testIn);
        System.setOut(new PrintStream(testOut, true, "UTF-8"));
        System.setErr(new PrintStream(testErr, true, "UTF-8"));

        int exitCode = 0;
        try {
            CustomClassLoader loader = new CustomClassLoader(WarmJvmRunner.class.getClassLoader(), classBytes);
            Class<?> clazz = loader.loadClass("Main");
            Method mainMethod = clazz.getMethod("main", String[].class);
            mainMethod.invoke(null, (Object) new String[0]);
        } catch (InvocationTargetException e) {
            Throwable cause = e.getCause();
            if (cause instanceof ExitException) {
                exitCode = ((ExitException) cause).status;
            } else {
                exitCode = 1;
                cause.printStackTrace(System.err);
            }
        } catch (Throwable t) {
            exitCode = 1;
            t.printStackTrace(System.err);
        } finally {
            System.setIn(origIn);
            System.setOut(origOut);
            System.setErr(origErr);
        }

        // Write response
        try (OutputStream out = new FileOutputStream("/workspace/output.pipe")) {
            writeResponse(out, exitCode, testOut.toByteArray(), testErr.toByteArray());
        }
    }

    private static void writeResponse(OutputStream out, int exitCode, byte[] stdoutBytes, byte[] stderrBytes) throws IOException {
        String stdoutBase64 = Base64.getEncoder().encodeToString(stdoutBytes);
        String stderrBase64 = Base64.getEncoder().encodeToString(stderrBytes);
        out.write((exitCode + "\n").getBytes("UTF-8"));
        out.write((stdoutBase64 + "\n").getBytes("UTF-8"));
        out.write((stderrBase64 + "\n").getBytes("UTF-8"));
        out.flush();
    }
}
