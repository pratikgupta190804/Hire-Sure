package com.nocode.controller;

import com.nocode.dto.request.SaveEvaluationRequest;
import com.nocode.entity.InterviewEvaluation;
import com.nocode.entity.User;
import com.nocode.exception.ResourceNotFoundException;
import com.nocode.exception.BadRequestException;
import com.nocode.repository.InterviewEvaluationRepository;
import com.nocode.repository.UserRepository;
import com.nocode.security.JwtUtil;
import com.nocode.util.SecurityUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/interviews")
@RequiredArgsConstructor
public class InterviewController {

    private final UserRepository userRepository;
    private final InterviewEvaluationRepository interviewEvaluationRepository;
    private final JwtUtil jwtUtil;

    @PostMapping("/session-token")
    public ResponseEntity<Map<String, String>> generateSessionToken() {
        String userId = SecurityUtil.requireCurrentUserId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        String token = jwtUtil.generateShortLivedToken(userId, user.getEmail(), user.getRole().name());
        return ResponseEntity.ok(Map.of("token", token));
    }

    @PostMapping("/evaluation")
    public ResponseEntity<InterviewEvaluation> saveEvaluation(@Valid @RequestBody SaveEvaluationRequest request) {
        String userId = SecurityUtil.requireCurrentUserId();
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));

        InterviewEvaluation eval = InterviewEvaluation.builder()
                .user(user)
                .role(request.getRole())
                .company(request.getCompany())
                .overallScore(request.getOverallScore())
                .technicalScore(request.getTechnicalScore())
                .communicationScore(request.getCommunicationScore())
                .feedbackJson(request.getFeedbackJson())
                .build();

        return ResponseEntity.ok(interviewEvaluationRepository.save(eval));
    }

    @GetMapping("/history")
    public ResponseEntity<List<InterviewEvaluation>> getHistory() {
        String userId = SecurityUtil.requireCurrentUserId();
        return ResponseEntity.ok(interviewEvaluationRepository.findByUserIdOrderByCreatedAtDesc(userId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<InterviewEvaluation> getEvaluation(@PathVariable String id) {
        String userId = SecurityUtil.requireCurrentUserId();
        InterviewEvaluation eval = interviewEvaluationRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Evaluation report not found"));
        if (!eval.getUser().getId().equals(userId)) {
            throw new BadRequestException("Access denied: You do not own this report");
        }
        return ResponseEntity.ok(eval);
    }
}
