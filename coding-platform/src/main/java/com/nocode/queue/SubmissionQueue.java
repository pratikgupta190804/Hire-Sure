package com.nocode.queue;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
@RequiredArgsConstructor
public class SubmissionQueue {

    private final StringRedisTemplate redisTemplate;
    private static final String QUEUE_KEY = "submissions:queue";

    public void push(String submissionId) {
        redisTemplate.opsForList().leftPush(QUEUE_KEY, submissionId);
    }

    public String pop(long timeoutSeconds) {
        try {
            return redisTemplate.opsForList().rightPop(QUEUE_KEY, timeoutSeconds, TimeUnit.SECONDS);
        } catch (Exception e) {
            // Fallback in case of temporary Redis disconnects
            return null;
        }
    }
}
