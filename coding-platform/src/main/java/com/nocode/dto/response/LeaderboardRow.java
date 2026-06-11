package com.nocode.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LeaderboardRow {
    private int rank;
    private String userId;
    private String username;
    private int score;
    private long penaltyTimeSeconds;
    private Integer ratingBefore;
    private Integer ratingChange;
    private List<LeaderboardProblemStatus> problemStatuses;
}
