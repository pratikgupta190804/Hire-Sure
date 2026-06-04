package com.nocode.repository;

import com.nocode.entity.ContestParticipation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ContestParticipationRepository extends JpaRepository<ContestParticipation, String> {
    Optional<ContestParticipation> findByUserIdAndContestId(String userId, String contestId);
    List<ContestParticipation> findByUserIdOrderByJoinedAtDesc(String userId);
}
