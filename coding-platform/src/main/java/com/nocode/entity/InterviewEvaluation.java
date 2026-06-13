package com.nocode.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "interview_evaluations")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class InterviewEvaluation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false)
    private String company;

    @Column(name = "overall_score", nullable = false)
    private Double overallScore;

    @Column(name = "technical_score")
    private Double technicalScore;

    @Column(name = "communication_score")
    private Double communicationScore;

    @Column(name = "feedback_json", columnDefinition = "TEXT")
    private String feedbackJson;

    @CreationTimestamp
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
