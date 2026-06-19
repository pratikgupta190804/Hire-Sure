package com.nocode.service;

import com.nocode.entity.Submission;
import com.nocode.entity.TestCase;
import com.nocode.enums.SubmissionStatus;
import com.nocode.repository.SubmissionRepository;
import com.nocode.repository.TestCaseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Separated from SubmissionService so @Async proxy works correctly.
 * Spring @Async only intercepts calls coming from OUTSIDE the bean.
 * If submit() and processAsync() were in the same class, the async
 * annotation would be silently ignored.
 */
@Service
@RequiredArgsConstructor
public class SubmissionProcessor {

    private final SubmissionRepository submissionRepository;
    private final TestCaseRepository testCaseRepository;
    private final ExecutionService executionEngine;

    @Async("judgeExecutor")
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void process(String submissionId) {
        // Small delay to ensure parent transaction commits
        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        
        Submission submission = submissionRepository.findById(submissionId).orElse(null);
        if (submission == null) {
            return;
        }

        submission.setStatus(SubmissionStatus.PROCESSING);
        submissionRepository.save(submission);

        try {
            List<TestCase> testCases = testCaseRepository
                    .findByProblemId(submission.getProblem().getId());

            if (testCases.isEmpty()) {
                fail(submission, SubmissionStatus.INTERNAL_ERROR, "No test cases configured");
                return;
            }

            List<String> inputs = testCases.stream().map(TestCase::getInput).toList();
            List<ExecutionResult> results = executionEngine.executeBatch(
                    submission.getSourceCode(),
                    submission.getLanguageId(),
                    inputs
            );

            if (results.isEmpty()) {
                fail(submission, SubmissionStatus.INTERNAL_ERROR, "No execution results returned from runner");
                return;
            }

            int totalRuntime = 0;

            for (int i = 0; i < results.size(); i++) {
                ExecutionResult result = results.get(i);
                TestCase tc = testCases.get(i);

                totalRuntime += (int) result.getRuntimeMs();

                // Compile error
                if (result.getCompileOutput() != null && !result.getCompileOutput().isBlank()) {
                    submission.setStatus(SubmissionStatus.COMPILATION_ERROR);
                    submission.setCompileOutput(result.getCompileOutput());
                    submission.setStderr(result.getStderr());
                    submission.setRuntimeMs(totalRuntime);
                    submissionRepository.save(submission);
                    return;
                }

                // TLE
                if (result.isTimedOut()) {
                    submission.setStatus(SubmissionStatus.TIME_LIMIT_EXCEEDED);
                    submission.setRuntimeMs(totalRuntime);
                    submissionRepository.save(submission);
                    return;
                }

                // MLE
                if (result.isOomKilled()) {
                    submission.setStatus(SubmissionStatus.MEMORY_LIMIT_EXCEEDED);
                    submission.setRuntimeMs(totalRuntime);
                    submissionRepository.save(submission);
                    return;
                }

                // Runtime error
                if (result.getExitCode() != 0) {
                    submission.setStatus(SubmissionStatus.RUNTIME_ERROR);
                    submission.setStderr(result.getStderr());
                    submission.setStdout(result.getStdout());
                    submission.setRuntimeMs(totalRuntime);
                    submissionRepository.save(submission);
                    return;
                }

                // Wrong answer
                String actual   = normalize(result.getStdout());
                String expected = normalize(tc.getExpectedOutput());
                if (!actual.equals(expected)) {
                    submission.setStatus(SubmissionStatus.WRONG_ANSWER);
                    submission.setStdout(result.getStdout());
                    submission.setRuntimeMs(totalRuntime);
                    submissionRepository.save(submission);
                    return;
                }
            }

            if (results.size() < testCases.size()) {
                fail(submission, SubmissionStatus.INTERNAL_ERROR, "Execution stopped prematurely without error details");
                return;
            }

            // All passed
            submission.setStatus(SubmissionStatus.ACCEPTED);
            submission.setRuntimeMs(totalRuntime);
            submissionRepository.save(submission);

        } catch (Exception e) {
            fail(submission, SubmissionStatus.INTERNAL_ERROR, e.getMessage());
        }
    }

    private void fail(Submission s, SubmissionStatus status, String msg) {
        s.setStatus(status);
        s.setStderr(msg);
        submissionRepository.save(s);
    }

    private String normalize(String output) {
        if (output == null) return "";
        return output.strip().replaceAll("\r\n", "\n").replaceAll("\r", "\n");
    }
}