package com.nocode.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LeaderboardProblemStatus {
    private String problemId;
    private boolean solved;
    private int score;
    private long timeToSolveSeconds; // time from contest start to first AC in seconds
    private int failedAttempts; // number of failed attempts before first AC
}
