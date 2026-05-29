package com.nocode.dto.response;

import lombok.Builder; import lombok.Data;
@Data @Builder
public class AuthResponse {
    private String token;
    private String userId;
    private String username;
    private String email;
    private String role;
}



