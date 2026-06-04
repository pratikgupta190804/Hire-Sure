package com.nocode.dto.response;

import com.nocode.enums.ContestStatus;
import com.nocode.enums.ContestVisibility;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Builder
public class ContestSummaryResponse {
    private String id;
    private String title;
    private ContestVisibility visibility;
    private LocalDateTime startAt;
    private LocalDateTime endAt;
    private ContestStatus status;
    private int problemCount;
    private boolean participating;
    private LocalDateTime createdAt;
}
