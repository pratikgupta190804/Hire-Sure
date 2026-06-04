package com.nocode.controller;

import com.nocode.dto.request.ContestRequest;
import com.nocode.dto.response.ContestDetailResponse;
import com.nocode.dto.response.ContestSummaryResponse;
import com.nocode.enums.ContestStatus;
import com.nocode.service.ContestService;
import com.nocode.util.SecurityUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/contests")
@RequiredArgsConstructor
public class ContestController {

    private final ContestService contestService;

    @GetMapping
    public ResponseEntity<Page<ContestSummaryResponse>> listContests(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) ContestStatus status) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        return ResponseEntity.ok(contestService.listContests(pageable, status));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ContestDetailResponse> getContest(@PathVariable String id) {
        String userId = SecurityUtil.getCurrentUserId().orElse(null);
        return ResponseEntity.ok(contestService.getContest(id, userId));
    }

    @GetMapping("/participated")
    public ResponseEntity<java.util.List<ContestSummaryResponse>> participated() {
        String userId = SecurityUtil.requireCurrentUserId();
        return ResponseEntity.ok(contestService.listParticipatedContests(userId));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ContestDetailResponse> createContest(
            @Valid @RequestBody ContestRequest request) {
        String adminId = SecurityUtil.getCurrentUserId()
                .orElseThrow(() -> new RuntimeException("Unauthorized"));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(contestService.createContest(request, adminId));
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<Void> join(@PathVariable String id) {
        String userId = SecurityUtil.requireCurrentUserId();
        contestService.joinContest(id, userId);
        return ResponseEntity.ok().build();
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ContestDetailResponse> updateContest(
            @PathVariable String id,
            @Valid @RequestBody ContestRequest request) {
        return ResponseEntity.ok(contestService.updateContest(id, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteContest(@PathVariable String id) {
        contestService.deleteContest(id);
        return ResponseEntity.noContent().build();
    }
}
