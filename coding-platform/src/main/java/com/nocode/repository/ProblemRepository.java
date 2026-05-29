package com.nocode.repository;

import com.nocode.entity.Problem;
import com.nocode.enums.Difficulty;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ProblemRepository extends JpaRepository<Problem, String> {
    Optional<Problem> findBySlug(String slug);
    boolean existsBySlug(String slug);
    Page<Problem> findByDifficulty(Difficulty difficulty, Pageable pageable);
    Page<Problem> findByTitleContainingIgnoreCase(String title, Pageable pageable);
}