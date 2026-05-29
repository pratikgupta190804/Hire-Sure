package com.nocode.repository;

import com.nocode.entity.TestCase;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TestCaseRepository extends JpaRepository<TestCase, String> {
    List<TestCase> findByProblemId(String problemId);
    List<TestCase> findByProblemIdAndIsHidden(String problemId, boolean isHidden);
}