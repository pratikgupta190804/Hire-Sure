package com.nocode.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SubmissionRequest {

    @NotBlank
    private String problemId;

    @NotBlank
    private String sourceCode;

    @NotNull
    private Integer languageId;  // Judge0 language ID
}