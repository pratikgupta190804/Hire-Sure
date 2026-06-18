package com.nocode.service;

import com.nocode.dto.request.SubmissionRequest;
import com.nocode.dto.response.SubmissionResponse;
import com.nocode.entity.Problem;
import com.nocode.entity.Submission;
import com.nocode.entity.User;
import com.nocode.enums.SubmissionStatus;
import com.nocode.exception.ResourceNotFoundException;
import com.nocode.exception.BadRequestException;
import com.nocode.repository.ProblemRepository;
import com.nocode.repository.SubmissionRepository;
import com.nocode.repository.UserRepository;
import com.nocode.repository.ContestProblemRepository;
import com.nocode.repository.ContestParticipationRepository;
import com.nocode.entity.Contest;
import com.nocode.queue.SubmissionQueue;
import java.time.LocalDateTime;
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
    private final ContestProblemRepository contestProblemRepository;
    private final ContestParticipationRepository contestParticipationRepository;
    private final SubmissionQueue submissionQueue;

    // ── Submit ──────────────────────────────────────────────────────────────

    @Transactional
    public SubmissionResponse submit(SubmissionRequest request, String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Problem problem = problemRepository.findById(request.getProblemId())
                .orElseThrow(() -> new ResourceNotFoundException("Problem not found"));

        Contest contest = null;
        if (problem.isContestOnly()) {
            java.util.Optional<com.nocode.entity.ContestProblem> cpOpt = contestProblemRepository
                    .findByGlobalProblemSlug(problem.getSlug());
            if (cpOpt.isPresent()) {
                com.nocode.entity.ContestProblem cp = cpOpt.get();
                LocalDateTime now = LocalDateTime.now();
                Contest c = cp.getContest();
                boolean contestOngoing = !now.isBefore(c.getStartAt()) && !now.isAfter(c.getEndAt());
                if (!contestOngoing) {
                    throw new BadRequestException("Submission are only allowed while the contest is running");
                }
                boolean hasJoined = contestParticipationRepository.findByUserIdAndContestId(userId, c.getId())
                        .isPresent();
                if (!hasJoined) {
                    throw new BadRequestException(
                            "You must register/join the contest to submit. Please join the contest first.");
                }
                contest = c;
            }
        }

        Submission submission = Submission.builder()
                .user(user)
                .problem(problem)
                .contest(contest)
                .sourceCode(request.getSourceCode())
                .languageId(request.getLanguageId())
                .status(SubmissionStatus.PENDING)
                .build();

        submission = submissionRepository.save(submission);

        // Add submission to queue
        submissionQueue.push(submission.getId());

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