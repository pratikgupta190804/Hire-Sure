package com.nocode.service;

import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class ExecutionResult {
    private String stdout;
    private String stderr;
    private String compileOutput;
    private int exitCode;
    private long runtimeMs;
    private boolean timedOut;
    private boolean oomKilled;

    public boolean isSuccess() {
        return exitCode == 0 && !timedOut && !oomKilled;
    }
}