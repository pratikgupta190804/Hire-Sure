package com.nocode.service;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
public class CodeExecutionEngineTest {

    @Autowired(required = false)
    private CodeExecutionEngine executionEngine;

    @Test
    public void testJavaWarmExecution() {
        if (executionEngine == null) {
            System.out.println("Execution engine is not enabled or loaded.");
            return;
        }

        String sourceCode = 
            "import java.util.Scanner;\n" +
            "public class Main {\n" +
            "    public static void main(String[] args) {\n" +
            "        Scanner sc = new Scanner(System.in);\n" +
            "        if (sc.hasNext()) {\n" +
            "            String word = sc.next();\n" +
            "            System.out.println(\"Hello, \" + word + \"!\");\n" +
            "        } else {\n" +
            "            System.out.println(\"Hello, World!\");\n" +
            "        }\n" +
            "    }\n" +
            "}\n";

        // Warm up and first execution
        ExecutionResult result1 = executionEngine.execute(sourceCode, Language.JAVA.getId(), "Antigravity");
        assertNotNull(result1);
        assertEquals(0, result1.getExitCode());
        assertEquals("Hello, Antigravity!\n", result1.getStdout());

        // Second execution (should be extremely fast because JVM is already warm!)
        long startMs = System.currentTimeMillis();
        ExecutionResult result2 = executionEngine.execute(sourceCode, Language.JAVA.getId(), "WarmJVM");
        long elapsedMs = System.currentTimeMillis() - startMs;
        
        assertNotNull(result2);
        assertEquals(0, result2.getExitCode());
        assertEquals("Hello, WarmJVM!\n", result2.getStdout());
        System.out.println("First run time: " + result1.getRuntimeMs() + "ms");
        System.out.println("Second run time: " + result2.getRuntimeMs() + "ms, elapsed: " + elapsedMs + "ms");
        
        // Assert performance is fast - second execution runtime should be very low
        assertTrue(result2.getRuntimeMs() < 1000, "JVM execution is not warm! Runtime: " + result2.getRuntimeMs() + "ms");
    }

    @Test
    public void testJavaSystemExitHandling() {
        if (executionEngine == null) return;

        String sourceCodeWithExit = 
            "public class Main {\n" +
            "    public static void main(String[] args) {\n" +
            "        System.out.println(\"Exiting...\");\n" +
            "        System.exit(42);\n" +
            "    }\n" +
            "}\n";

        ExecutionResult result = executionEngine.execute(sourceCodeWithExit, Language.JAVA.getId(), null);
        assertNotNull(result);
        assertEquals(42, result.getExitCode());
        assertEquals("Exiting...\n", result.getStdout());
    }

    @Test
    public void testJavaBatchExecution() {
        if (executionEngine == null) return;

        String sourceCode = 
            "import java.util.Scanner;\n" +
            "public class Main {\n" +
            "    public static void main(String[] args) {\n" +
            "        Scanner sc = new Scanner(System.in);\n" +
            "        if (sc.hasNext()) {\n" +
            "            System.out.println(\"Java: \" + sc.next());\n" +
            "        }\n" +
            "    }\n" +
            "}\n";

        java.util.List<String> inputs = java.util.List.of("One", "Two", "Three");
        long startMs = System.currentTimeMillis();
        java.util.List<ExecutionResult> results = executionEngine.executeBatch(sourceCode, Language.JAVA.getId(), inputs);
        long elapsedMs = System.currentTimeMillis() - startMs;

        assertNotNull(results);
        assertEquals(3, results.size());
        assertEquals("Java: One\n", results.get(0).getStdout());
        assertEquals("Java: Two\n", results.get(1).getStdout());
        assertEquals("Java: Three\n", results.get(2).getStdout());
        System.out.println("Java batch execution elapsed: " + elapsedMs + "ms");
    }

    @Test
    public void testPythonBatchExecution() {
        if (executionEngine == null) return;

        String sourceCode = 
            "import sys\n" +
            "val = sys.stdin.read().strip()\n" +
            "print(f'Python: {val}')\n";

        java.util.List<String> inputs = java.util.List.of("Alpha", "Beta", "Gamma");
        long startMs = System.currentTimeMillis();
        java.util.List<ExecutionResult> results = executionEngine.executeBatch(sourceCode, Language.PYTHON3.getId(), inputs);
        long elapsedMs = System.currentTimeMillis() - startMs;

        assertNotNull(results);
        assertEquals(3, results.size());
        assertEquals("Python: Alpha\n", results.get(0).getStdout());
        assertEquals("Python: Beta\n", results.get(1).getStdout());
        assertEquals("Python: Gamma\n", results.get(2).getStdout());
        System.out.println("Python batch execution elapsed: " + elapsedMs + "ms");
    }

    @Test
    public void testCppBatchExecution() {
        if (executionEngine == null) return;

        String sourceCode = 
            "#include <iostream>\n" +
            "#include <string>\n" +
            "int main() {\n" +
            "    std::string val;\n" +
            "    if (std::cin >> val) {\n" +
            "        std::cout << \"Cpp: \" << val << std::endl;\n" +
            "    }\n" +
            "    return 0;\n" +
            "}\n";

        java.util.List<String> inputs = java.util.List.of("X", "Y", "Z");
        long startMs = System.currentTimeMillis();
        java.util.List<ExecutionResult> results = executionEngine.executeBatch(sourceCode, Language.CPP.getId(), inputs);
        long elapsedMs = System.currentTimeMillis() - startMs;

        assertNotNull(results);
        assertEquals(3, results.size());
        assertEquals("Cpp: X\n", results.get(0).getStdout());
        assertEquals("Cpp: Y\n", results.get(1).getStdout());
        assertEquals("Cpp: Z\n", results.get(2).getStdout());
        System.out.println("Cpp batch execution elapsed: " + elapsedMs + "ms");
    }
}
