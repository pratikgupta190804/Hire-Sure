package com.nocode.dto.response;

import lombok.*;
import java.util.List;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ResumeResponse {
    private String summary;
    private String experienceLevel;
    private List<String> skills;
    private List<String> preferredRoles;
}
