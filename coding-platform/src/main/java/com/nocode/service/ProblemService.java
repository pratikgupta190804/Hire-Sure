package com.nocode.service;

import com.nocode.dto.request.ProblemRequest;
import com.nocode.dto.response.ProblemDetailResponse;
import com.nocode.dto.response.ProblemSummaryResponse;
import com.nocode.entity.Problem;
import com.nocode.entity.TestCase;
import com.nocode.entity.User;
import com.nocode.enums.Difficulty;
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

import java.text.Normalizer;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class ProblemService {

    private final ProblemRepository problemRepository;
    private final SubmissionRepository submissionRepository;
    private final UserRepository userRepository;

    private static final Pattern NON_ALPHANUMERIC = Pattern.compile("[^a-z0-9]+");

    // ── Public queries ──────────────────────────────────────────────────

    public Page<ProblemSummaryResponse> listProblems(Difficulty difficulty,
            String search,
            String currentUserId,
            Pageable pageable) {
        Page<Problem> page;
        if (difficulty != null) {
            page = problemRepository.findByDifficultyAndIsContestOnlyFalse(difficulty, pageable);
        } else if (search != null && !search.isBlank()) {
            page = problemRepository.findByTitleContainingIgnoreCaseAndIsContestOnlyFalse(search, pageable);
        } else {
            page = problemRepository.findByIsContestOnlyFalse(pageable);
        }

        return page.map(p -> ProblemSummaryResponse.builder()
                .id(p.getId())
                .title(p.getTitle())
                .slug(p.getSlug())
                .difficulty(p.getDifficulty())
                .solved(isSolvedByUser(p.getId(), currentUserId))
                .createdAt(p.getCreatedAt())
                .build());
    }

    public ProblemDetailResponse getProblemBySlug(String slug) {
        Problem p = problemRepository.findBySlug(slug)
                .orElseThrow(() -> new ResourceNotFoundException("Problem not found: " + slug));
        return toDetail(p);
    }

    // ── Admin mutations ──────────────────────────────────────────────────

    @Transactional
    public ProblemDetailResponse createProblem(ProblemRequest request, String adminId) {
        User admin = userRepository.findById(adminId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        String slug = generateSlug(request.getTitle());

        Problem problem = Problem.builder()
                .title(request.getTitle())
                .slug(slug)
                .description(request.getDescription())
                .difficulty(request.getDifficulty())
                .constraints(request.getConstraints())
                .inputFormat(request.getInputFormat())
                .outputFormat(request.getOutputFormat())
                .sampleInput(request.getSampleInput())
                .sampleOutput(request.getSampleOutput())
                .timeComplexity(request.getTimeComplexity())
                .spaceComplexity(request.getSpaceComplexity())
                .hints(request.getHints())
                .topicTags(request.getTopicTags())
                .createdBy(admin)
                .build();

        if (request.getTestCases() != null) {
            request.getTestCases().forEach(tc -> {
                TestCase testCase = TestCase.builder()
                        .problem(problem)
                        .input(tc.getInput())
                        .expectedOutput(tc.getExpectedOutput())
                        .isHidden(tc.isHidden())
                        .build();
                problem.getTestCases().add(testCase);
            });
        }

        return toDetail(problemRepository.save(problem));
    }

    @Transactional
    public ProblemDetailResponse updateProblem(String id, ProblemRequest request) {
        Problem problem = problemRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Problem not found: " + id));

        problem.setTitle(request.getTitle());
        problem.setDescription(request.getDescription());
        problem.setDifficulty(request.getDifficulty());
        problem.setConstraints(request.getConstraints());
        problem.setInputFormat(request.getInputFormat());
        problem.setOutputFormat(request.getOutputFormat());
        problem.setSampleInput(request.getSampleInput());
        problem.setSampleOutput(request.getSampleOutput());
        problem.setTimeComplexity(request.getTimeComplexity());
        problem.setSpaceComplexity(request.getSpaceComplexity());
        problem.setHints(request.getHints());
        problem.setTopicTags(request.getTopicTags());

        return toDetail(problemRepository.save(problem));
    }

    @Transactional
    public void deleteProblem(String id) {
        if (!problemRepository.existsById(id)) {
            throw new ResourceNotFoundException("Problem not found: " + id);
        }
        problemRepository.deleteById(id);
    }

    // ── Helpers ──────────────────────────────────────────────────────────

    private ProblemDetailResponse toDetail(Problem p) {
        return ProblemDetailResponse.builder()
                .id(p.getId())
                .title(p.getTitle())
                .slug(p.getSlug())
                .description(p.getDescription())
                .difficulty(p.getDifficulty())
                .constraints(p.getConstraints())
                .inputFormat(p.getInputFormat())
                .outputFormat(p.getOutputFormat())
                .sampleInput(p.getSampleInput())
                .sampleOutput(p.getSampleOutput())
                .timeComplexity(p.getTimeComplexity())
                .spaceComplexity(p.getSpaceComplexity())
                .hints(p.getHints())
                .topicTags(p.getTopicTags())
                .createdAt(p.getCreatedAt())
                .updatedAt(p.getUpdatedAt())
                .build();
    }

    private boolean isSolvedByUser(String problemId, String userId) {
        if (userId == null)
            return false;
        return submissionRepository.existsByUserIdAndProblemIdAndStatus(
                userId, problemId, SubmissionStatus.ACCEPTED);
    }

    private String generateSlug(String title) {
        String normalized = Normalizer.normalize(title, Normalizer.Form.NFD)
                .toLowerCase(Locale.ROOT);
        String slug = NON_ALPHANUMERIC.matcher(normalized).replaceAll("-")
                .replaceAll("^-|-$", "");

        // Handle collisions
        String candidate = slug;
        int suffix = 2;
        while (problemRepository.existsBySlug(candidate)) {
            candidate = slug + "-" + suffix++;
        }
        return candidate;
    }
}