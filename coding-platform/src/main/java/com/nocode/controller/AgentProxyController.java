package com.nocode.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api/agent")
public class AgentProxyController {

    @Value("${AGENT_SERVICE_URL:http://localhost:8001/api}")
    private String agentServiceUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    private String getFastApiBaseUrl() {
        if (agentServiceUrl.endsWith("/api")) {
            return agentServiceUrl.substring(0, agentServiceUrl.length() - 4);
        }
        return agentServiceUrl;
    }

    @PostMapping("/resume/extract")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> extractResume(@RequestParam("file") MultipartFile file) throws IOException {
        String url = getFastApiBaseUrl() + "/agent/resume/extract";

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
        try {
            ResponseEntity<Map> response = restTemplate.postForEntity(url, requestEntity, Map.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Failed to contact agent service: " + e.getMessage()));
        }
    }

    @PostMapping("/generate/preview")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> generatePreview(@RequestBody Map<String, Object> requestBody,
                                                              @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String url = getFastApiBaseUrl() + "/generate/preview";
        return forwardRequest(url, HttpMethod.POST, requestBody, authHeader);
    }

    @GetMapping("/generate/status/{taskId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> getStatus(@PathVariable String taskId,
                                                         @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String url = getFastApiBaseUrl() + "/generate/status/" + taskId;
        return forwardRequest(url, HttpMethod.GET, null, authHeader);
    }

    @GetMapping("/generate/preview/list")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> listPreviews(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        String url = getFastApiBaseUrl() + "/generate/preview/list";
        return forwardRequest(url, HttpMethod.GET, null, authHeader);
    }

    @PostMapping("/generate/save/{previewId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> savePreview(@PathVariable String previewId,
                                                           @RequestBody(required = false) Map<String, Object> requestBody,
                                                           @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String url = getFastApiBaseUrl() + "/generate/save/" + previewId;
        return forwardRequest(url, HttpMethod.POST, requestBody, authHeader);
    }

    @DeleteMapping("/generate/preview/{previewId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Map<String, Object>> discardPreview(@PathVariable String previewId,
                                                              @RequestHeader(value = "Authorization", required = false) String authHeader) {
        String url = getFastApiBaseUrl() + "/generate/preview/" + previewId;
        return forwardRequest(url, HttpMethod.DELETE, null, authHeader);
    }

    private ResponseEntity<Map<String, Object>> forwardRequest(String url, HttpMethod method, Object body, String authHeader) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        if (authHeader != null) {
            headers.set("Authorization", authHeader);
        }

        HttpEntity<Object> entity = new HttpEntity<>(body, headers);
        try {
            ResponseEntity<Map> response = restTemplate.exchange(url, method, entity, Map.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("message", "Proxy forwarding error: " + e.getMessage()));
        }
    }
}
