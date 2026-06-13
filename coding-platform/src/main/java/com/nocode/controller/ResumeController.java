package com.nocode.controller;

import com.nocode.dto.response.ResumeResponse;
import com.nocode.service.ResumeService;
import com.nocode.util.SecurityUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ResumeController {

    private final ResumeService resumeService;

    @PostMapping("/resume/upload")
    public ResponseEntity<ResumeResponse> uploadResume(@RequestParam("file") MultipartFile file) throws IOException {
        String userId = SecurityUtil.requireCurrentUserId();
        ResumeResponse response = resumeService.uploadResume(file, userId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/resume")
    public ResponseEntity<ResumeResponse> getResume() {
        String userId = SecurityUtil.requireCurrentUserId();
        ResumeResponse response = resumeService.getResume(userId);
        if (response == null) {
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.ok(response);
    }

    @PostMapping("/resume/skills")
    public ResponseEntity<ResumeResponse> updateSkills(@RequestBody List<String> skills) {
        String userId = SecurityUtil.requireCurrentUserId();
        ResumeResponse response = resumeService.updateSkills(skills, userId);
        return ResponseEntity.ok(response);
    }

    @GetMapping("/jobs/matches")
    public ResponseEntity<Map<String, Object>> getJobMatches(@RequestParam(value = "role", required = false) String role) {
        String userId = SecurityUtil.requireCurrentUserId();
        Map<String, Object> matches = resumeService.getJobMatches(userId, role);
        return ResponseEntity.ok(matches);
    }
}
