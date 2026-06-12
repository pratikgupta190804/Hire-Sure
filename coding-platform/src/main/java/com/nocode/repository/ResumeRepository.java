package com.nocode.repository;

import com.nocode.entity.Resume;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ResumeRepository extends JpaRepository<Resume, String> {
    Optional<Resume> findByUserId(String userId);
}
