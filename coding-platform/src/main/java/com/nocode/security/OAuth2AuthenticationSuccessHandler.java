package com.nocode.security;

import com.nocode.entity.User;
import com.nocode.enums.Role;
import com.nocode.repository.UserRepository;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class OAuth2AuthenticationSuccessHandler extends SimpleUrlAuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final JwtUtil jwtUtil;

    @Value("${app.oauth2.redirect-uri}")
    private String redirectUri;

    @Override
    public void onAuthenticationSuccess(HttpServletRequest request,
                                        HttpServletResponse response,
                                        Authentication authentication) throws IOException, ServletException {
        if (response.isCommitted()) {
            return;
        }

        OAuth2AuthenticationToken oauthToken = (OAuth2AuthenticationToken) authentication;
        String provider = oauthToken.getAuthorizedClientRegistrationId(); // "google" or "github"
        OAuth2User oAuth2User = oauthToken.getPrincipal();

        String email = null;
        String name = null;

        if ("google".equalsIgnoreCase(provider)) {
            email = oAuth2User.getAttribute("email");
            name = oAuth2User.getAttribute("name");
        } else if ("github".equalsIgnoreCase(provider)) {
            email = oAuth2User.getAttribute("email");
            name = oAuth2User.getAttribute("name");
            String login = oAuth2User.getAttribute("login");
            if (email == null && login != null) {
                email = login.toLowerCase() + "@github.com";
            }
            if (name == null) {
                name = login;
            }
        }

        if (email == null) {
            throw new ServletException("Email not found from OAuth2 provider");
        }

        final String finalEmail = email;
        final String finalName = name;

        User user = userRepository.findByEmail(finalEmail)
                .orElseGet(() -> {
                    String baseUsername = finalName != null ? finalName.replaceAll("\\s+", "").toLowerCase() : "user";
                    if (baseUsername.length() > 40) {
                        baseUsername = baseUsername.substring(0, 40);
                    }
                    String username = baseUsername;
                    int suffix = 1;
                    while (userRepository.existsByUsername(username)) {
                        String suffixStr = String.valueOf(suffix++);
                        if (baseUsername.length() + suffixStr.length() > 45) {
                            username = baseUsername.substring(0, 45 - suffixStr.length()) + suffixStr;
                        } else {
                            username = baseUsername + suffixStr;
                        }
                    }

                    User newUser = User.builder()
                            .email(finalEmail)
                            .username(username)
                            .passwordHash("")
                            .provider(provider)
                            .role(Role.USER)
                            .build();
                    return userRepository.save(newUser);
                });

        if (user.getProvider() == null || !user.getProvider().equals(provider)) {
            user.setProvider(provider);
            userRepository.save(user);
        }

        String token = jwtUtil.generateToken(user.getId(), user.getEmail(), user.getRole().name());

        String targetUrl = UriComponentsBuilder.fromUriString(redirectUri)
                .queryParam("token", token)
                .queryParam("userId", user.getId())
                .queryParam("username", user.getUsername())
                .queryParam("email", user.getEmail())
                .queryParam("role", user.getRole().name())
                .build().toUriString();

        getRedirectStrategy().sendRedirect(request, response, targetUrl);
    }
}
