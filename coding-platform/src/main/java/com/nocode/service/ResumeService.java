package com.nocode.service;

import com.nocode.dto.response.ResumeResponse;
import com.nocode.entity.Resume;
import com.nocode.entity.User;
import com.nocode.repository.ResumeRepository;
import com.nocode.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ResumeService {

    private static final Logger logger = LoggerFactory.getLogger(ResumeService.class);

    private final ResumeRepository resumeRepository;
    private final UserRepository userRepository;

    @Value("${app.agent-service.url:http://localhost:8001}")
    private String agentServiceUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    @Transactional
    public ResumeResponse uploadResume(MultipartFile file, String userId) throws IOException {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        // Prepare Multipart request to Python agent service
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);

        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        ByteArrayResource fileResource = new ByteArrayResource(file.getBytes()) {
            @Override
            public String getFilename() {
                return file.getOriginalFilename();
            }
        };
        body.add("file", fileResource);

        HttpEntity<MultiValueMap<String, Object>> requestEntity = new HttpEntity<>(body, headers);
        String url = agentServiceUrl + "/agent/resume/extract";

        logger.info("Sending resume file to agent service at: {}", url);
        ResponseEntity<ResumeResponse> response = restTemplate.postForEntity(url, requestEntity, ResumeResponse.class);

        if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
            throw new RuntimeException("Failed to extract skills from resume via agent service");
        }

        ResumeResponse extracted = response.getBody();

        // Save or update in database
        Resume resume = resumeRepository.findByUserId(userId)
                .orElse(Resume.builder().user(user).build());

        resume.setSummary(extracted.getSummary());
        resume.setExperienceLevel(extracted.getExperienceLevel());
        resume.setSkills(extracted.getSkills() != null ? extracted.getSkills() : new ArrayList<>());
        resume.setPreferredRoles(extracted.getPreferredRoles() != null ? extracted.getPreferredRoles() : new ArrayList<>());

        resumeRepository.save(resume);

        return mapToResponse(resume);
    }

    @Transactional(readOnly = true)
    public ResumeResponse getResume(String userId) {
        Optional<Resume> resumeOpt = resumeRepository.findByUserId(userId);
        return resumeOpt.map(this::mapToResponse).orElse(null);
    }

    @Transactional
    public ResumeResponse updateSkills(List<String> skills, String userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("User not found"));

        Resume resume = resumeRepository.findByUserId(userId)
                .orElse(Resume.builder().user(user).experienceLevel("Not Specified").summary("").build());

        resume.setSkills(skills);
        resumeRepository.save(resume);

        return mapToResponse(resume);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> getJobMatches(String userId, String role) {
        Resume resume = resumeRepository.findByUserId(userId)
                .orElseThrow(() -> new RuntimeException("Resume not uploaded yet"));

        if (resume.getSkills() == null || resume.getSkills().isEmpty()) {
            Map<String, Object> emptyResponse = new HashMap<>();
            emptyResponse.put("success", true);
            emptyResponse.put("skills", Collections.emptyList());
            emptyResponse.put("matches", Collections.emptyList());
            emptyResponse.put("message", "No skills available on your profile to match.");
            return emptyResponse;
        }

        // Prepare request body for python matchmaking endpoint
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("skills", resume.getSkills());
        if (role != null && !role.trim().isEmpty()) {
            requestBody.put("role", role.trim());
        } else if (resume.getPreferredRoles() != null && !resume.getPreferredRoles().isEmpty()) {
            requestBody.put("role", resume.getPreferredRoles().get(0));
        } else {
            requestBody.put("role", "Software Engineer");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);

        HttpEntity<Map<String, Object>> entity = new HttpEntity<>(requestBody, headers);
        String url = agentServiceUrl + "/agent/jobs/match";

        logger.info("Requesting job matches from agent service for user ID {} at: {}", userId, url);
        ResponseEntity<Map> response = restTemplate.postForEntity(url, entity, Map.class);

        if (response.getStatusCode() != HttpStatus.OK || response.getBody() == null) {
            throw new RuntimeException("Failed to match jobs via agent service");
        }

        return (Map<String, Object>) response.getBody();
    }

    private ResumeResponse mapToResponse(Resume resume) {
        return ResumeResponse.builder()
                .summary(resume.getSummary())
                .experienceLevel(resume.getExperienceLevel())
                .skills(resume.getSkills())
                .preferredRoles(resume.getPreferredRoles())
                .build();
    }
}
