package com.nocode.util;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;

import java.util.Optional;

public class SecurityUtil {

    private SecurityUtil() {}

    public static Optional<String> getCurrentUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) return Optional.empty();
        Object principal = auth.getPrincipal();
        if (principal instanceof UserDetails ud) return Optional.of(ud.getUsername());
        return Optional.empty();
    }

    public static String requireCurrentUserId() {
        return getCurrentUserId()
                .orElseThrow(() -> new RuntimeException("Not authenticated"));
    }
}