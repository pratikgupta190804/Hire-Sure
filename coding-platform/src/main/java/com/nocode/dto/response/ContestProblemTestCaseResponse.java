package com.nocode.dto.response;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ContestProblemTestCaseResponse {
    private String input;
    private String expectedOutput;
    private boolean hidden;
}
