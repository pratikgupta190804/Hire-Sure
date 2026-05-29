package com.nocode.controller;

import com.nocode.dto.request.ProblemRequest;
import com.nocode.dto.response.ProblemDetailResponse;
import com.nocode.dto.response.ProblemSummaryResponse;
import com.nocode.enums.Difficulty;
import com.nocode.service.ProblemService;
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
@RequestMapping("/api/problems")
@RequiredArgsConstructor
public class ProblemController {

    private final ProblemService problemService;

    // GET /api/problems?difficulty=EASY&search=two+sum&page=0&size=20
    @GetMapping
    public ResponseEntity<Page<ProblemSummaryResponse>> listProblems(
            @RequestParam(required = false) Difficulty difficulty,
            @RequestParam(required = false) String search,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        Pageable pageable = PageRequest.of(page, size, Sort.by("createdAt").descending());
        String currentUserId = SecurityUtil.getCurrentUserId().orElse(null);
        return ResponseEntity.ok(problemService.listProblems(difficulty, search, currentUserId, pageable));
    }

    // GET /api/problems/{slug}
    @GetMapping("/{slug}")
    public ResponseEntity<ProblemDetailResponse> getProblem(@PathVariable String slug) {
        return ResponseEntity.ok(problemService.getProblemBySlug(slug));
    }

    // POST /api/problems  (ADMIN only)
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ProblemDetailResponse> createProblem(
            @Valid @RequestBody ProblemRequest request) {
        String adminId = SecurityUtil.getCurrentUserId()
                .orElseThrow(() -> new RuntimeException("Unauthorized"));
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(problemService.createProblem(request, adminId));
    }

    // PUT /api/problems/{id}  (ADMIN only)
    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ProblemDetailResponse> updateProblem(
            @PathVariable String id,
            @Valid @RequestBody ProblemRequest request) {
        return ResponseEntity.ok(problemService.updateProblem(id, request));
    }

    // DELETE /api/problems/{id}  (ADMIN only)
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> deleteProblem(@PathVariable String id) {
        problemService.deleteProblem(id);
        return ResponseEntity.noContent().build();
    }
}