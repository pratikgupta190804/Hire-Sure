package com.nocode.service;

import java.util.List;

/**
 * Abstraction over code execution.
 *
 * Current implementation: CodeExecutionEngine (local Docker via docker-java SDK)
 *
 * Future implementations (swap with zero changes to SubmissionService):
 *   - RemoteExecutionService  → HTTP call to a dedicated Node.js / Go runner
 *   - PistonExecutionService  → self-hosted Piston API
 *   - SandboxExecutionService → gVisor / Firecracker based sandbox
 *
 * To swap: change @Primary annotation from CodeExecutionEngine to new impl,
 * or use application.properties to conditionally load beans.
 */
public interface ExecutionService {

    /**
     * @param sourceCode  raw source code string
     * @param languageId  internal language ID (see Language enum)
     * @param stdin       input to pipe into the program
     * @return            execution result with stdout, stderr, exit code, timing
     */
    ExecutionResult execute(String sourceCode, int languageId, String stdin);

    /**
     * Executes the same source code sequentially against multiple stdin inputs.
     *
     * For compiled languages, compiles exactly once and runs the compiled artifact
     * for each input. Terminates early on the first failing test case.
     *
     * @param sourceCode  raw source code string
     * @param languageId  internal language ID (see Language enum)
     * @param stdins      list of inputs to pipe into the program sequentially
     * @return            list of execution results for each ran testcase
     */
    List<ExecutionResult> executeBatch(String sourceCode, int languageId, List<String> stdins);
}