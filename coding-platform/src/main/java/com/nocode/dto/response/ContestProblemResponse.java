package com.nocode.dto.response;

import com.nocode.enums.Difficulty;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class ContestProblemResponse {
    private String title;
    private String slug;
    private String description;
    private Difficulty difficulty;
    private String constraints;
    private String inputFormat;
    private String outputFormat;
    private String sampleInput;
    private String sampleOutput;
    private int points;
    private List<ContestProblemTestCaseResponse> testCases;
}
