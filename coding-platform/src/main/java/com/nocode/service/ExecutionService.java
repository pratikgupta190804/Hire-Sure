package com.nocode.service;

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
}