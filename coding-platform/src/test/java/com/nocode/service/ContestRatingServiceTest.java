package com.nocode.service;

import com.nocode.entity.Contest;
import com.nocode.entity.ContestParticipation;
import com.nocode.entity.User;
import com.nocode.repository.ContestParticipationRepository;
import com.nocode.repository.ContestRepository;
import com.nocode.repository.ProblemRepository;
import com.nocode.repository.SubmissionRepository;
import com.nocode.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class ContestRatingServiceTest {

    @Mock
    private ContestRepository contestRepository;
    @Mock
    private ContestParticipationRepository contestParticipationRepository;
    @Mock
    private SubmissionRepository submissionRepository;
    @Mock
    private ProblemRepository problemRepository;
    @Mock
    private UserRepository userRepository;

    @InjectMocks
    private ContestRatingService contestRatingService;

    private Contest contest;

    @BeforeEach
    void setUp() {
        contest = Contest.builder()
                .id("contest-1")
                .title("Weekly Contest")
                .startAt(LocalDateTime.now().minusHours(2))
                .endAt(LocalDateTime.now().minusHours(1))
                .isRatingCalculated(false)
                .problems(new ArrayList<>())
                .build();
    }

    @Test
    void testCalculateRatingsWithNoParticipants() {
        when(contestRepository.findById("contest-1")).thenReturn(Optional.of(contest));
        when(contestParticipationRepository.findByContestId("contest-1")).thenReturn(List.of());

        contestRatingService.calculateRatings("contest-1");

        assertTrue(contest.isRatingCalculated());
        verify(contestRepository, times(1)).save(contest);
    }

    @Test
    void testCalculateRatingsWithTwoParticipants() {
        User user1 = User.builder().id("u1").username("user1").rating(1500).build();
        User user2 = User.builder().id("u2").username("user2").rating(1600).build();

        ContestParticipation cp1 = ContestParticipation.builder().id("cp1").contest(contest).user(user1).build();
        ContestParticipation cp2 = ContestParticipation.builder().id("cp2").contest(contest).user(user2).build();

        when(contestRepository.findById("contest-1")).thenReturn(Optional.of(contest));
        when(contestParticipationRepository.findByContestId("contest-1")).thenReturn(List.of(cp1, cp2));
        when(submissionRepository.findContestSubmissions(anyList(), any(), any())).thenReturn(List.of());

        contestRatingService.calculateRatings("contest-1");

        assertEquals(1, cp1.getRanking());
        assertEquals(1, cp2.getRanking());
        assertEquals(0, cp1.getScore());
        assertEquals(0, cp2.getScore());
        assertTrue(contest.isRatingCalculated());

        int delta1 = cp1.getRatingChange();
        int delta2 = cp2.getRatingChange();
        
        // The rating changes must balance out to sum of 0
        assertEquals(0, delta1 + delta2);
    }
}
