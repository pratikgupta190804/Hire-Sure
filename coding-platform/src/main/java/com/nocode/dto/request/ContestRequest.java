package com.nocode.dto.request;

import com.nocode.enums.ContestVisibility;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class ContestRequest {

    @NotBlank
    private String title;

    private String description;
    private String rules;

    @NotNull
    private ContestVisibility visibility;

    @NotNull
    private LocalDateTime startAt;

    @NotNull
    private LocalDateTime endAt;

    @Valid
    private List<ContestProblemRequest> problems;
}
