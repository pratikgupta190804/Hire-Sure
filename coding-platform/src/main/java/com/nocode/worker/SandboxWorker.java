package com.nocode.worker;

import com.nocode.queue.SubmissionQueue;
import com.nocode.service.SubmissionProcessor;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class SandboxWorker {

    private final SubmissionQueue submissionQueue;
    private final SubmissionProcessor submissionProcessor;

    @PostConstruct
    public void start() {
        Thread.ofVirtual().start(this::consume);
    }

    private void consume() {
        while (true) {
            try {
                String submissionId = submissionQueue.pop(30);

                if (submissionId != null) {
                    submissionProcessor.process(submissionId);
                }

            } catch (Exception e) {
                log.error("Worker error", e);
            }
        }
    }
}