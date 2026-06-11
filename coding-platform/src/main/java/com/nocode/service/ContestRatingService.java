package com.nocode.service;

import com.nocode.entity.Contest;
import com.nocode.entity.ContestParticipation;
import com.nocode.entity.ContestProblem;
import com.nocode.entity.Problem;
import com.nocode.entity.Submission;
import com.nocode.entity.User;
import com.nocode.enums.SubmissionStatus;
import com.nocode.exception.BadRequestException;
import com.nocode.exception.ResourceNotFoundException;
import com.nocode.repository.ContestParticipationRepository;
import com.nocode.repository.ContestRepository;
import com.nocode.repository.ProblemRepository;
import com.nocode.repository.SubmissionRepository;
import com.nocode.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ContestRatingService {

    private final ContestRepository contestRepository;
    private final ContestParticipationRepository contestParticipationRepository;
    private final SubmissionRepository submissionRepository;
    private final ProblemRepository problemRepository;
    private final UserRepository userRepository;

    @Transactional
    public void calculateRatings(String contestId) {
        Contest contest = contestRepository.findById(contestId)
                .orElseThrow(() -> new ResourceNotFoundException("Contest not found: " + contestId));

        if (contest.isRatingCalculated()) {
            throw new BadRequestException("Ratings have already been calculated for this contest.");
        }

        LocalDateTime now = LocalDateTime.now();
        if (now.isBefore(contest.getEndAt())) {
            throw new BadRequestException("Cannot calculate ratings before the contest finishes.");
        }

        List<ContestParticipation> participations = contestParticipationRepository.findByContestId(contestId);
        if (participations.isEmpty()) {
            contest.setRatingCalculated(true);
            contestRepository.save(contest);
            return;
        }

        // 1. Get all contest problems and their global problem IDs
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

        // 2. Fetch all submissions during the contest duration
        List<Submission> submissions = submissionRepository.findContestSubmissions(
                problemIds, contest.getStartAt(), contest.getEndAt());

        // Set of registered user IDs
        Set<String> participantUserIds = participations.stream()
                .map(p -> p.getUser().getId())
                .collect(Collectors.toSet());

        // Group submissions by user
        Map<String, List<Submission>> userSubmissions = submissions.stream()
                .filter(s -> participantUserIds.contains(s.getUser().getId()))
                .collect(Collectors.groupingBy(s -> s.getUser().getId()));

        // 3. Compute score and penalty for each participant
        List<ParticipantStats> statsList = new ArrayList<>();
        for (ContestParticipation p : participations) {
            String userId = p.getUser().getId();
            List<Submission> userSubs = userSubmissions.getOrDefault(userId, List.of());

            int totalScore = 0;
            int totalPenaltySeconds = 0;

            // Compute status for each contest problem
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
                    totalScore += cp.getPoints();

                    // Solve time in seconds from contest start
                    long solveTimeSec = Duration.between(contest.getStartAt(), firstAc.getSubmittedAt()).toSeconds();

                    // Count WA/errors before first AC
                    long failedAttempts = problemSubs.stream()
                            .filter(s -> s.getSubmittedAt().isBefore(firstAc.getSubmittedAt()))
                            .filter(s -> s.getStatus() != SubmissionStatus.ACCEPTED && s.getStatus() != SubmissionStatus.PENDING && s.getStatus() != SubmissionStatus.PROCESSING)
                            .count();

                    totalPenaltySeconds += solveTimeSec + (failedAttempts * 300); // 5 mins per failed attempt
                }
            }

            statsList.add(new ParticipantStats(p, totalScore, totalPenaltySeconds));
        }

        // 4. Sort and assign ranks (higher score first, then lower penalty)
        statsList.sort((a, b) -> {
            if (a.score != b.score) {
                return Integer.compare(b.score, a.score);
            }
            return Integer.compare(a.penaltyTimeSeconds, b.penaltyTimeSeconds);
        });

        int currentRank = 1;
        for (int i = 0; i < statsList.size(); i++) {
            if (i > 0) {
                ParticipantStats current = statsList.get(i);
                ParticipantStats prev = statsList.get(i - 1);
                if (current.score != prev.score || current.penaltyTimeSeconds != prev.penaltyTimeSeconds) {
                    currentRank = i + 1;
                }
            }
            statsList.get(i).rank = currentRank;
        }

        // 5. Elo/Codeforces rating calculation (only if N > 1)
        int n = statsList.size();
        if (n > 1) {
            List<Integer> oldRatings = statsList.stream()
                    .map(p -> p.participation.getUser().getRating())
                    .toList();

            List<Double> deltas = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                int currentRating = oldRatings.get(i);
                double actualRank = statsList.get(i).rank;

                // Expected rank
                double expectedRank = 1.0;
                for (int j = 0; j < n; j++) {
                    if (j == i) continue;
                    expectedRank += 1.0 / (1.0 + Math.pow(10.0, (currentRating - oldRatings.get(j)) / 400.0));
                }

                // Geometric mean of actual and expected rank
                double M = Math.sqrt(actualRank * expectedRank);

                // Binary search for performance rating
                double low = 1.0;
                double high = 8000.0;
                for (int iter = 0; iter < 50; iter++) {
                    double mid = (low + high) / 2.0;
                    double er = getExpectedRank(mid, oldRatings, i);
                    if (er < M) {
                        high = mid;
                    } else {
                        low = mid;
                    }
                }
                double R_opt = (low + high) / 2.0;
                double delta = (R_opt - currentRating) / 2.0;
                deltas.add(delta);
            }

            // Adjustment to sum up to 0
            double sumDeltas = deltas.stream().mapToDouble(Double::doubleValue).sum();
            double adjustment = -sumDeltas / n;

            for (int i = 0; i < n; i++) {
                ParticipantStats stats = statsList.get(i);
                double finalDelta = deltas.get(i) + adjustment;
                int roundedDelta = (int) Math.round(finalDelta);

                User user = stats.participation.getUser();
                int oldRating = user.getRating();
                int newRating = Math.max(1, oldRating + roundedDelta); // rating cannot go below 1

                user.setRating(newRating);
                userRepository.save(user);

                stats.participation.setRatingBefore(oldRating);
                stats.participation.setRatingChange(roundedDelta);
            }
        } else if (n == 1) {
            // Solo participant — gets no rating change, but gets stats updated
            ParticipantStats stats = statsList.get(0);
            stats.participation.setRatingBefore(stats.participation.getUser().getRating());
            stats.participation.setRatingChange(0);
        }

        // 6. Update ContestParticipation records
        for (ParticipantStats stats : statsList) {
            ContestParticipation cp = stats.participation;
            cp.setRanking(stats.rank);
            cp.setScore(stats.score);
            cp.setPenaltyTime(stats.penaltyTimeSeconds);
            contestParticipationRepository.save(cp);
        }

        // 7. Mark contest ratings as calculated
        contest.setRatingCalculated(true);
        contestRepository.save(contest);
    }

    private double getExpectedRank(double rating, List<Integer> allRatings, int selfIndex) {
        double expectedRank = 1.0;
        for (int j = 0; j < allRatings.size(); j++) {
            if (j == selfIndex) continue;
            expectedRank += 1.0 / (1.0 + Math.pow(10.0, (rating - allRatings.get(j)) / 400.0));
        }
        return expectedRank;
    }

    private static class ParticipantStats {
        final ContestParticipation participation;
        final int score;
        final int penaltyTimeSeconds;
        int rank;

        ParticipantStats(ContestParticipation CP, int score, int penaltyTimeSeconds) {
            this.participation = CP;
            this.score = score;
            this.penaltyTimeSeconds = penaltyTimeSeconds;
        }
    }
}
