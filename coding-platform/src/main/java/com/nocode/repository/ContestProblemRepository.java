package com.nocode.repository;

import com.nocode.entity.ContestProblem;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ContestProblemRepository extends JpaRepository<ContestProblem, String> {
    Optional<ContestProblem> findByGlobalProblemSlug(String globalProblemSlug);
}
