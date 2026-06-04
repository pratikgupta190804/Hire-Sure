package com.nocode.repository;

import com.nocode.entity.ContestParticipation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ContestParticipationRepository extends JpaRepository<ContestParticipation, String> {

    Optional<ContestParticipation> findByUserIdAndContestId(String userId, String contestId);

    // Old method — kept for reference but replaced below.
    // List<ContestParticipation> findByUserIdOrderByJoinedAtDesc(String userId);

    /**
     * Fix: JOIN FETCH both the contest and its problems collection in one query
     * to prevent N+1 when listParticipatedContests() calls toSummary(), which
     * reads contest.getProblems().size() for every row.
     *
     * Two separate FETCH joins on a collection + association would produce a
     * Cartesian product, so we fetch the contest eagerly here and let the
     * problems collection be fetched in a second batched query via
     * @BatchSize on ContestProblem (add @BatchSize(size=30) to Contest.problems).
     */
    @Query("""
            SELECT cp FROM ContestParticipation cp
            JOIN FETCH cp.contest c
            WHERE cp.user.id = :userId
            ORDER BY cp.joinedAt DESC
            """)
    List<ContestParticipation> findByUserIdWithContestAndProblems(@Param("userId") String userId);
}