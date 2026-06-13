package com.nocode.controller;

import com.nocode.dto.request.SubmissionRequest;
import com.nocode.dto.response.SubmissionResponse;
import com.nocode.service.SubmissionService;
import com.nocode.util.SecurityUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import com.nocode.dto.request.ExecuteRequest;
import com.nocode.service.ExecutionResult;
import com.nocode.service.ExecutionService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/submissions")
@RequiredArgsConstructor
public class SubmissionController {

    private final SubmissionService submissionService;
    private final ExecutionService executionService;

    // POST /api/submissions/execute
    @PostMapping("/execute")
    public ResponseEntity<ExecutionResult> execute(
            @Valid @RequestBody ExecuteRequest request) {
        ExecutionResult result = executionService.execute(
                request.getSourceCode(),
                request.getLanguageId(),
                request.getStdin()
        );
        return ResponseEntity.ok(result);
    }

    // POST /api/submissions
    @PostMapping
    public ResponseEntity<SubmissionResponse> submit(
            @Valid @RequestBody SubmissionRequest request) {
        String userId = SecurityUtil.requireCurrentUserId();
        SubmissionResponse response = submissionService.submit(request, userId);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    // GET /api/submissions/{id}  — poll for result
    @GetMapping("/{id}")
    public ResponseEntity<SubmissionResponse> getSubmission(@PathVariable String id) {
        String userId = SecurityUtil.requireCurrentUserId();
        return ResponseEntity.ok(submissionService.getSubmission(id, userId));
    }

    // GET /api/submissions/me?page=0&size=20
    @GetMapping("/me")
    public ResponseEntity<Page<SubmissionResponse>> mySubmissions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        String userId = SecurityUtil.requireCurrentUserId();
        Pageable pageable = PageRequest.of(page, size, Sort.by("submittedAt").descending());
        return ResponseEntity.ok(submissionService.getMySubmissions(userId, pageable));
    }

    // GET /api/submissions/problem/{problemId}
    @GetMapping("/problem/{problemId}")
    public ResponseEntity<Page<SubmissionResponse>> problemSubmissions(
            @PathVariable String problemId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        Pageable pageable = PageRequest.of(page, size, Sort.by("submittedAt").descending());
        return ResponseEntity.ok(submissionService.getSubmissionsForProblem(problemId, pageable));
    }
}