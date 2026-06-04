package com.nocode.repository;

import com.nocode.entity.Contest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.time.LocalDateTime;

public interface ContestRepository extends JpaRepository<Contest, String> {
	Page<Contest> findByStartAtAfter(LocalDateTime time, Pageable pageable);
	Page<Contest> findByEndAtBefore(LocalDateTime time, Pageable pageable);
	Page<Contest> findByStartAtBeforeAndEndAtAfter(LocalDateTime start, LocalDateTime end, Pageable pageable);
}
