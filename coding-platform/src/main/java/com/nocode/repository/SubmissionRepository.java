package com.nocode.repository;

import com.nocode.entity.Submission;
import com.nocode.enums.SubmissionStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SubmissionRepository extends JpaRepository<Submission, String> {
    Page<Submission> findByUserId(String userId, Pageable pageable);
    Page<Submission> findByProblemId(String problemId, Pageable pageable);
    Page<Submission> findByUserIdAndProblemId(String userId, String problemId, Pageable pageable);
    List<Submission> findByStatus(SubmissionStatus status);
    boolean existsByUserIdAndProblemIdAndStatus(String userId, String problemId, SubmissionStatus status);
}