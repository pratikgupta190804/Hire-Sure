package com.nocode.dto.response;

import com.nocode.enums.SubmissionStatus;
import lombok.Builder; import lombok.Data;
import java.time.LocalDateTime;
@Data @Builder
public class SubmissionResponse {
    private String id;
    private String problemId;
    private String problemTitle;
    private Integer languageId;
    private SubmissionStatus status;
    private Integer runtimeMs;
    private Integer memoryKb;
    private String stdout;
    private String stderr;
    private String compileOutput;
    private LocalDateTime submittedAt;
}
