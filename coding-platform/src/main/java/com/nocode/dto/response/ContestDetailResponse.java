package com.nocode.dto.response;

import com.nocode.enums.ContestStatus;
import com.nocode.enums.ContestVisibility;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Builder
public class ContestDetailResponse {
    private String id;
    private String title;
    private String description;
    private String rules;
    private ContestVisibility visibility;
    private LocalDateTime startAt;
    private LocalDateTime endAt;
    private ContestStatus status;
    private boolean participating;
    private List<ContestProblemResponse> problems;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
