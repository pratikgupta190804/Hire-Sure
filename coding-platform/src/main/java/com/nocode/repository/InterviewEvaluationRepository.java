package com.nocode.repository;

import com.nocode.entity.InterviewEvaluation;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface InterviewEvaluationRepository extends JpaRepository<InterviewEvaluation, String> {
    List<InterviewEvaluation> findByUserIdOrderByCreatedAtDesc(String userId);
}
