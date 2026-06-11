package com.nocode.service;

import com.nocode.dto.request.ContestProblemRequest;
import com.nocode.dto.request.ContestRequest;
import com.nocode.dto.response.ContestDetailResponse;
import com.nocode.dto.response.ContestProblemResponse;
import com.nocode.dto.response.ContestProblemTestCaseResponse;
import com.nocode.dto.response.ContestSummaryResponse;
import com.nocode.entity.Contest;
import com.nocode.entity.ContestProblem;
import com.nocode.entity.ContestProblemTestCase;
import com.nocode.entity.ContestParticipation;
import com.nocode.entity.User;
import com.nocode.enums.ContestStatus;
import com.nocode.exception.BadRequestException;
import com.nocode.exception.ResourceNotFoundException;
import com.nocode.repository.ContestParticipationRepository;
import com.nocode.repository.ContestRepository;
import com.nocode.repository.ProblemRepository;
import com.nocode.repository.UserRepository;
import com.nocode.repository.SubmissionRepository;
import com.nocode.entity.Submission;
import com.nocode.enums.SubmissionStatus;
import com.nocode.dto.response.ContestLeaderboardResponse;
import com.nocode.dto.response.LeaderboardRow;
import com.nocode.dto.response.LeaderboardProblemStatus;
import java.util.Set;
import java.util.HashSet;
import java.util.Map;
import java.util.HashMap;
import java.util.Optional;
import java.util.Comparator;
import java.time.Duration;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.nocode.entity.Problem;
import com.nocode.entity.TestCase;

import java.text.Normalizer;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class ContestService {

    private final ContestRepository contestRepository;
    private final ContestParticipationRepository contestParticipationRepository;
    private final UserRepository userRepository;
    private final ProblemRepository problemRepository;
    private final SubmissionRepository submissionRepository;

    private static final Pattern NON_ALPHANUMERIC = Pattern.compile("[^a-z0-9]+");

    @Transactional(readOnly = true)
    public Page<ContestSummaryResponse> listContests(Pageable pageable, ContestStatus status, String userId) {
        // Fix: capture a single `now` and pass it through to statusFor()
        // so the filter predicate and the status label stay in sync.
        LocalDateTime now = LocalDateTime.now();
        Page<Contest> page;
        if (status == ContestStatus.UPCOMING) {
            page = contestRepository.findByStartAtAfter(now, pageable);
        } else if (status == ContestStatus.FINISHED) {
            page = contestRepository.findByEndAtBefore(now, pageable);
        } else if (status == ContestStatus.ONGOING) {
            page = contestRepository.findByStartAtBeforeAndEndAtAfter(now, now, pageable);
        } else {
            page = contestRepository.findAll(pageable);
        }

        // Optimize N+1 queries by fetching registered contest IDs for this user in one query
        List<String> contestIds = page.getContent().stream().map(Contest::getId).toList();
        Set<String> participatedContestIds = new HashSet<>();
        if (userId != null && !contestIds.isEmpty()) {
            participatedContestIds.addAll(contestParticipationRepository.findJoinedContestIds(userId, contestIds));
        }

        final Set<String> finalParticipatedIds = participatedContestIds;
        return page.map(c -> toSummary(c, finalParticipatedIds.contains(c.getId()), now));
    }

    @Transactional(readOnly = true)
    public ContestDetailResponse getContest(String id, String userId) {
        Contest contest = contestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found: " + id));
        LocalDateTime now = LocalDateTime.now();
        boolean participating = userId != null && isParticipating(userId, id);
        boolean includeProblems = !now.isBefore(contest.getStartAt());
        return toDetail(contest, includeProblems, participating, now);
    }

    @Transactional(readOnly = true)
    public ContestLeaderboardResponse getLeaderboard(String contestId) {
        Contest contest = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found: " + contestId));

        List<ContestProblem> contestProblems = contest.getProblems();
        List<String> problemIds = new ArrayList<>();
        Map<String, ContestProblem> problemIdToContestProblemMap = new HashMap<>();

        for (ContestProblem cp : contestProblems) {
            Optional<Problem> gpOpt = problemRepository.findBySlug(cp.getGlobalProblemSlug());
            if (gpOpt.isPresent()) {
                String id = gpOpt.get().getId();
                problemIds.add(id);
                problemIdToContestProblemMap.put(id, cp);
            }
        }

        // 1. Fetch all submissions during the contest duration for these problems
        List<Submission> submissions = submissionRepository.findContestSubmissions(
                problemIds, contest.getStartAt(), contest.getEndAt());

        // 2. Fetch all registered participants
        List<ContestParticipation> participations = contestParticipationRepository.findByContestId(contestId);
        Set<String> participantUserIds = participations.stream()
                .map(p -> p.getUser().getId())
                .collect(Collectors.toSet());

        // Group submissions by user ID
        Map<String, List<Submission>> userSubmissions = submissions.stream()
                .filter(s -> participantUserIds.contains(s.getUser().getId()))
                .collect(Collectors.groupingBy(s -> s.getUser().getId()));

        List<LeaderboardRow> rows = new ArrayList<>();

        if (contest.isRatingCalculated()) {
            // Ratings calculated: Fetch finalized standings from ContestParticipation
            List<ContestParticipation> sortedParticipations = contestParticipationRepository
                    .findByContestIdOrderByRankingAsc(contestId);

            for (ContestParticipation cp : sortedParticipations) {
                String userId = cp.getUser().getId();
                List<Submission> userSubs = userSubmissions.getOrDefault(userId, List.of());
                List<LeaderboardProblemStatus> probStatuses = calculateProblemStatuses(problemIds, problemIdToContestProblemMap, userSubs, contest.getStartAt());

                rows.add(LeaderboardRow.builder()
                        .rank(cp.getRanking() != null ? cp.getRanking() : 1)
                        .userId(userId)
                        .username(cp.getUser().getUsername())
                        .score(cp.getScore() != null ? cp.getScore() : 0)
                        .penaltyTimeSeconds(cp.getPenaltyTime() != null ? cp.getPenaltyTime() : 0)
                        .ratingBefore(cp.getRatingBefore())
                        .ratingChange(cp.getRatingChange())
                        .problemStatuses(probStatuses)
                        .build());
            }
        } else {
            // Live/ongoing or before finalization: Calculate leaderboard dynamically
            for (ContestParticipation cp : participations) {
                String userId = cp.getUser().getId();
                List<Submission> userSubs = userSubmissions.getOrDefault(userId, List.of());
                List<LeaderboardProblemStatus> probStatuses = calculateProblemStatuses(problemIds, problemIdToContestProblemMap, userSubs, contest.getStartAt());

                int totalScore = 0;
                long totalPenaltySeconds = 0;
                for (LeaderboardProblemStatus ps : probStatuses) {
                    if (ps.isSolved()) {
                        totalScore += ps.getScore();
                        totalPenaltySeconds += ps.getTimeToSolveSeconds() + (ps.getFailedAttempts() * 300L);
                    }
                }

                rows.add(LeaderboardRow.builder()
                        .userId(userId)
                        .username(cp.getUser().getUsername())
                        .score(totalScore)
                        .penaltyTimeSeconds(totalPenaltySeconds)
                        .problemStatuses(probStatuses)
                        .build());
            }

            // Sort by score desc, penalty time asc
            rows.sort((a, b) -> {
                if (a.getScore() != b.getScore()) {
                    return Integer.compare(b.getScore(), a.getScore());
                }
                return Long.compare(a.getPenaltyTimeSeconds(), b.getPenaltyTimeSeconds());
            });

            // Assign ranks
            int currentRank = 1;
            for (int i = 0; i < rows.size(); i++) {
                if (i > 0) {
                    LeaderboardRow current = rows.get(i);
                    LeaderboardRow prev = rows.get(i - 1);
                    if (current.getScore() != prev.getScore() || current.getPenaltyTimeSeconds() != prev.getPenaltyTimeSeconds()) {
                        currentRank = i + 1;
                    }
                }
                rows.get(i).setRank(currentRank);
            }
        }

        return new ContestLeaderboardResponse(rows);
    }

    private List<LeaderboardProblemStatus> calculateProblemStatuses(
            List<String> problemIds,
            Map<String, ContestProblem> problemIdToContestProblemMap,
            List<Submission> userSubs,
            LocalDateTime contestStart) {

        List<LeaderboardProblemStatus> probStatuses = new ArrayList<>();

        for (String problemId : problemIds) {
            ContestProblem cp = problemIdToContestProblemMap.get(problemId);
            List<Submission> problemSubs = userSubs.stream()
                    .filter(s -> s.getProblem().getId().equals(problemId))
                    .sorted(Comparator.comparing(Submission::getSubmittedAt))
                    .toList();

            Optional<Submission> firstAcOpt = problemSubs.stream()
                    .filter(s -> s.getStatus() == SubmissionStatus.ACCEPTED)
                    .findFirst();

            if (firstAcOpt.isPresent()) {
                Submission firstAc = firstAcOpt.get();
                long solveTimeSec = Duration.between(contestStart, firstAc.getSubmittedAt()).toSeconds();

                long failedAttempts = problemSubs.stream()
                        .filter(s -> s.getSubmittedAt().isBefore(firstAc.getSubmittedAt()))
                        .filter(s -> s.getStatus() != SubmissionStatus.ACCEPTED && s.getStatus() != SubmissionStatus.PENDING && s.getStatus() != SubmissionStatus.PROCESSING)
                        .count();

                probStatuses.add(LeaderboardProblemStatus.builder()
                        .problemId(problemId)
                        .solved(true)
                        .score(cp.getPoints())
                        .timeToSolveSeconds(solveTimeSec)
                        .failedAttempts((int) failedAttempts)
                        .build());
            } else {
                long failedAttempts = problemSubs.stream()
                        .filter(s -> s.getStatus() != SubmissionStatus.PENDING && s.getStatus() != SubmissionStatus.PROCESSING)
                        .count();

                probStatuses.add(LeaderboardProblemStatus.builder()
                        .problemId(problemId)
                        .solved(false)
                        .score(0)
                        .timeToSolveSeconds(0)
                        .failedAttempts((int) failedAttempts)
                        .build());
            }
        }

        return probStatuses;
    }

    @Transactional(readOnly = true)
    public List<ContestSummaryResponse> listParticipatedContests(String userId) {
        // Fix: use JOIN FETCH to avoid N+1 on contest + problems collection
        List<ContestParticipation> participations = contestParticipationRepository
                .findByUserIdWithContestAndProblems(userId);
        LocalDateTime now = LocalDateTime.now();
        return participations.stream()
                .map(p -> toSummary(p.getContest(), true, now))
                .toList();
    }

    @Transactional
    public ContestDetailResponse createContest(ContestRequest request, String adminId) {
        validateRequest(request);

        User admin = userRepository.findById(adminId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        Contest contest = Contest.builder()
                .title(request.getTitle())
                .description(request.getDescription())
                .rules(request.getRules())
                .visibility(request.getVisibility())
                .startAt(request.getStartAt())
                .endAt(request.getEndAt())
                .createdBy(admin)
                .build();

        buildProblems(request, contest);

        LocalDateTime now = LocalDateTime.now();
        return toDetail(contestRepository.save(contest), true, false, now);
    }

    @Transactional
    public ContestDetailResponse updateContest(String id, ContestRequest request) {
        validateRequest(request);

        Contest contest = contestRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found: " + id));

        contest.setTitle(request.getTitle());
        contest.setDescription(request.getDescription());
        contest.setRules(request.getRules());
        contest.setVisibility(request.getVisibility());
        contest.setStartAt(request.getStartAt());
        contest.setEndAt(request.getEndAt());

        // Fix: clear + flush first so Hibernate deletes old rows before
        // inserting new ones, avoiding potential UK/FK constraint violations.
        contest.getProblems().clear();
        contestRepository.saveAndFlush(contest);

        buildProblems(request, contest);

        LocalDateTime now = LocalDateTime.now();
        return toDetail(contestRepository.save(contest), true, false, now);
    }

    @Transactional
    public void deleteContest(String id) {
        if (!contestRepository.existsById(id)) {
            throw new ResourceNotFoundException("Contest not found: " + id);
        }
        contestRepository.deleteById(id);
    }

    @Transactional
    public void joinContest(String contestId, String userId) {
        Contest contest = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found: " + contestId));

        LocalDateTime now = LocalDateTime.now();

        // Fix: block joining after the contest has ended
        if (now.isAfter(contest.getEndAt())) {
            throw new BadRequestException("Contest has already finished");
        }

        // Fix: optionally block joining before registration opens — remove
        // this block if you want pre-registration to be allowed.
        // if (now.isBefore(contest.getStartAt())) {
        // throw new BadRequestException("Contest registration has not opened yet");
        // }

        if (contestParticipationRepository.findByUserIdAndContestId(userId, contestId).isPresent()) {
            return; // idempotent — already joined
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        ContestParticipation participation = ContestParticipation.builder()
                .contest(contest)
                .user(user)
                .build();
        contestParticipationRepository.save(participation);
    }

    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------

    /**
     * Builds ContestProblem + ContestProblemTestCase instances from the request
     * and adds them to the given contest. Extracted to avoid duplication between
     * createContest() and updateContest().
     */
    private void buildProblems(ContestRequest request, Contest contest) {
        int index = 0;

        for (ContestProblemRequest cp : request.getProblems()) {

            // Create global Problem
            Problem problem = Problem.builder()
                    .title(cp.getTitle())
                    .slug(generateSlug(cp.getTitle()))
                    .description(cp.getDescription())
                    .difficulty(cp.getDifficulty())
                    .constraints(cp.getConstraints())
                    .inputFormat(cp.getInputFormat())
                    .outputFormat(cp.getOutputFormat())
                    .sampleInput(cp.getSampleInput())
                    .sampleOutput(cp.getSampleOutput())
                    .isContestOnly(true)
                    .build();

            if (cp.getTestCases() != null) {
                cp.getTestCases().forEach(tc -> problem.getTestCases().add(
                        TestCase.builder()
                                .problem(problem)
                                .input(tc.getInput())
                                .expectedOutput(tc.getExpectedOutput())
                                .isHidden(tc.isHidden())
                                .build()));
            }

            Problem savedProblem = problemRepository.save(problem);

            // Create ContestProblem
            ContestProblem item = ContestProblem.builder()
                    .contest(contest)
                    .title(cp.getTitle())
                    .description(cp.getDescription())
                    .difficulty(cp.getDifficulty())
                    .constraints(cp.getConstraints())
                    .inputFormat(cp.getInputFormat())
                    .outputFormat(cp.getOutputFormat())
                    .sampleInput(cp.getSampleInput())
                    .sampleOutput(cp.getSampleOutput())
                    .points(cp.getPoints())
                    .orderIndex(index++)
                    .globalProblemSlug(savedProblem.getSlug())
                    .build();

            if (cp.getTestCases() != null) {
                cp.getTestCases().forEach(tc -> item.getTestCases().add(
                        ContestProblemTestCase.builder()
                                .contestProblem(item)
                                .input(tc.getInput())
                                .expectedOutput(tc.getExpectedOutput())
                                .isHidden(tc.isHidden())
                                .build()));
            }

            contest.getProblems().add(item);
        }
    }

    private ContestSummaryResponse toSummary(Contest contest, boolean participating, LocalDateTime now) {
        return ContestSummaryResponse.builder()
                .id(contest.getId())
                .title(contest.getTitle())
                .visibility(contest.getVisibility())
                .startAt(contest.getStartAt())
                .endAt(contest.getEndAt())
                .status(statusFor(contest, now))
                // Fix: avoid loading the full collection just for a count —
                // replace with @Formula on Contest once you add that column.
                .problemCount(contest.getProblems().size())
                .participating(participating)
                .ratingCalculated(contest.isRatingCalculated())
                .createdAt(contest.getCreatedAt())
                .build();
    }

    private ContestDetailResponse toDetail(Contest contest, boolean includeProblems,
            boolean participating, LocalDateTime now) {
        return ContestDetailResponse.builder()
                .id(contest.getId())
                .title(contest.getTitle())
                .description(contest.getDescription())
                .rules(contest.getRules())
                .visibility(contest.getVisibility())
                .startAt(contest.getStartAt())
                .endAt(contest.getEndAt())
                .status(statusFor(contest, now))
                .participating(participating)
                .problems(includeProblems
                        ? contest.getProblems().stream()
                                .map(cp -> ContestProblemResponse.builder()
                                        .title(cp.getTitle())
                                        .slug(cp.getGlobalProblemSlug())
                                        .description(cp.getDescription())
                                        .difficulty(cp.getDifficulty())
                                        .constraints(cp.getConstraints())
                                        .inputFormat(cp.getInputFormat())
                                        .outputFormat(cp.getOutputFormat())
                                        .sampleInput(cp.getSampleInput())
                                        .sampleOutput(cp.getSampleOutput())
                                        .points(cp.getPoints())
                                        // Fix: only expose non-hidden test cases to participants.
                                        // When you add admin-context support, pass a flag here
                                        // to include hidden ones for admins.
                                        .testCases(cp.getTestCases().stream()
                                                .filter(tc -> !tc.isHidden())
                                                .map(tc -> ContestProblemTestCaseResponse.builder()
                                                        .input(tc.getInput())
                                                        .expectedOutput(tc.getExpectedOutput())
                                                        .hidden(tc.isHidden())
                                                        .build())
                                                .toList())
                                        .build())
                                .toList()
                        : List.of())
                .createdAt(contest.getCreatedAt())
                .updatedAt(contest.getUpdatedAt())
                .build();
    }

    // Fix: accepts `now` as a parameter so the caller controls the reference time,
    // keeping filter predicates and status labels consistent within a single
    // request.
    private ContestStatus statusFor(Contest contest, LocalDateTime now) {
        if (now.isBefore(contest.getStartAt()))
            return ContestStatus.UPCOMING;
        if (now.isAfter(contest.getEndAt()))
            return ContestStatus.FINISHED;
        return ContestStatus.ONGOING;
    }

    private boolean isParticipating(String userId, String contestId) {
        return contestParticipationRepository
                .findByUserIdAndContestId(userId, contestId)
                .isPresent();
    }

    private void validateRequest(ContestRequest request) {
        if (request.getStartAt() != null && request.getEndAt() != null
                && !request.getStartAt().isBefore(request.getEndAt())) {
            throw new BadRequestException("Start time must be before end time");
        }
        if (request.getProblems() == null || request.getProblems().isEmpty()) {
            throw new BadRequestException("Contest must include at least one problem");
        }
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