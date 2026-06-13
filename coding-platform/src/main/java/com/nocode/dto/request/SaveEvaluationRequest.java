package com.nocode.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SaveEvaluationRequest {

    @NotBlank
    private String role;

    @NotBlank
    private String company;

    @NotNull
    private Double overallScore;

    private Double technicalScore;

    private Double communicationScore;

    @NotBlank
    private String feedbackJson;
}
