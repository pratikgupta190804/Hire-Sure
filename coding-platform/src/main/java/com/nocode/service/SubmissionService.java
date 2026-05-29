package com.nocode.service;

import com.nocode.dto.request.SubmissionRequest;
import com.nocode.dto.response.SubmissionResponse;
import com.nocode.entity.Problem;
import com.nocode.entity.Submission;
import com.nocode.entity.User;
import com.nocode.enums.SubmissionStatus;
import com.nocode.exception.ResourceNotFoundException;
import com.nocode.repository.ProblemRepository;
import com.nocode.repository.SubmissionRepository;
import com.nocode.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SubmissionService {

    private final SubmissionRepository submissionRepository;
    private final ProblemRepository problemRepository;
    private final UserRepository userRepository;
    private final SubmissionProcessor processor; // separate bean — @Async works correctly

    // ── Submit ──────────────────────────────────────────────────────────────

    @Transactional
    public SubmissionResponse submit(SubmissionRequest request, String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        
        Problem problem = problemRepository.findById(request.getProblemId())
                .orElseThrow(() -> new ResourceNotFoundException("Problem not found"));

        Submission submission = Submission.builder()
                .user(user)
                .problem(problem)
                .sourceCode(request.getSourceCode())
                .languageId(request.getLanguageId())
                .status(SubmissionStatus.PENDING)
                .build();

        submission = submissionRepository.save(submission);

        // Fires async in judgeExecutor thread pool — returns immediately to caller
        processor.process(submission.getId());

        return toResponse(submission);
    }

    // ── Queries ─────────────────────────────────────────────────────────────

    public SubmissionResponse getSubmission(String id, String userId) {
        Submission s = submissionRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Submission not found"));
        return toResponse(s);
    }

    public Page<SubmissionResponse> getMySubmissions(String userId, Pageable pageable) {
        return submissionRepository.findByUserId(userId, pageable).map(this::toResponse);
    }

    public Page<SubmissionResponse> getSubmissionsForProblem(String problemId, Pageable pageable) {
        return submissionRepository.findByProblemId(problemId, pageable).map(this::toResponse);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private SubmissionResponse toResponse(Submission s) {
        return SubmissionResponse.builder()
                .id(s.getId())
                .problemId(s.getProblem().getId())
                .problemTitle(s.getProblem().getTitle())
                .languageId(s.getLanguageId())
                .status(s.getStatus())
                .runtimeMs(s.getRuntimeMs())
                .memoryKb(s.getMemoryKb())
                .stdout(s.getStdout())
                .stderr(s.getStderr())
                .compileOutput(s.getCompileOutput())
                .submittedAt(s.getSubmittedAt())
                .build();
    }
}