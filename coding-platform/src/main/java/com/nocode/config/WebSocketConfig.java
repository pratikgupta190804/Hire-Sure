package com.nocode.config;

import com.nocode.websocket.FastApiWebSocketProxy;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.List;

@Configuration
@EnableWebSocket
@RequiredArgsConstructor
public class WebSocketConfig implements WebSocketConfigurer {

    private final FastApiWebSocketProxy webSocketProxy;

    @Value("${app.cors.allowed-origins:http://localhost:5173,https://*.railway.app}")
    private List<String> allowedOrigins;

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(webSocketProxy, "/api/interview/ws")
                .setAllowedOriginPatterns(allowedOrigins.toArray(new String[0]));
    }
}
