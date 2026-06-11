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

    @org.springframework.data.jpa.repository.Query("""
        SELECT s FROM Submission s
        WHERE s.problem.id IN :problemIds
          AND s.submittedAt >= :start
          AND s.submittedAt <= :end
    """)
    List<Submission> findContestSubmissions(
        @org.springframework.data.repository.query.Param("problemIds") List<String> problemIds,
        @org.springframework.data.repository.query.Param("start") java.time.LocalDateTime start,
        @org.springframework.data.repository.query.Param("end") java.time.LocalDateTime end
    );
}