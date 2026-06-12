package com.nocode.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "resumes")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Resume {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false, unique = true)
    private User user;

    @Column(columnDefinition = "TEXT")
    private String summary;

    @Column(name = "experience_level")
    private String experienceLevel;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "resume_skills", joinColumns = @JoinColumn(name = "resume_id"))
    @Column(name = "skill")
    @Builder.Default
    private List<String> skills = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "resume_preferred_roles", joinColumns = @JoinColumn(name = "resume_id"))
    @Column(name = "preferred_role")
    @Builder.Default
    private List<String> preferredRoles = new ArrayList<>();

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
