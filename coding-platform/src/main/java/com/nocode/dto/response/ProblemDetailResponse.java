package com.nocode.dto.response;

import com.nocode.enums.Difficulty;
import lombok.Builder; import lombok.Data;
import java.time.LocalDateTime;
@Data @Builder
public class ProblemDetailResponse {
    private String id;
    private String title;
    private String slug;
    private String description;
    private Difficulty difficulty;
    private String constraints;
    private String inputFormat;
    private String outputFormat;
    private String sampleInput;
    private String sampleOutput;
    private String timeComplexity;
    private String spaceComplexity;
    private String hints;
    private String topicTags;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}