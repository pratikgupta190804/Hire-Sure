package com.nocode.dto.response;

import com.nocode.enums.Difficulty;
import lombok.Builder; import lombok.Data;
import java.time.LocalDateTime;
@Data @Builder
public class ProblemSummaryResponse {
    private String id;
    private String title;
    private String slug;
    private Difficulty difficulty;
    private boolean solved;
    private LocalDateTime createdAt;
}