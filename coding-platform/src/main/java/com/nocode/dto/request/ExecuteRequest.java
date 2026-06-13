package com.nocode.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class ExecuteRequest {

    @NotBlank
    private String sourceCode;

    @NotNull
    private Integer languageId;

    private String stdin;
}
