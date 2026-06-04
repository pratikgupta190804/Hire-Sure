package com.nocode.entity;

import com.nocode.enums.Difficulty;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "contest_problems")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ContestProblem {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contest_id", nullable = false)
    private Contest contest;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false, unique = true)
    private String globalProblemSlug;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Difficulty difficulty;

    @Column(columnDefinition = "TEXT")
    private String constraints;

    @Column(columnDefinition = "TEXT")
    private String inputFormat;

    @Column(columnDefinition = "TEXT")
    private String outputFormat;

    @Column(columnDefinition = "TEXT")
    private String sampleInput;

    @Column(columnDefinition = "TEXT")
    private String sampleOutput;

    @Column(nullable = false)
    private int points;

    @Column(nullable = false)
    private int orderIndex;

    @OneToMany(mappedBy = "contestProblem", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<ContestProblemTestCase> testCases = new ArrayList<>();
}
