package com.nocode.websocket;

import com.nocode.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.net.URI;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequiredArgsConstructor
public class FastApiWebSocketProxy extends TextWebSocketHandler {

    private final JwtUtil jwtUtil;

    @Value("${AGENT_SERVICE_URL:http://localhost:8001/api}")
    private String agentServiceUrl;

    private final Map<WebSocketSession, WebSocketSession> clientToAgentSessions = new ConcurrentHashMap<>();
    private final Map<WebSocketSession, WebSocketSession> agentToClientSessions = new ConcurrentHashMap<>();

    private String getFastApiWsUrl() {
        String base = agentServiceUrl;
        if (base.startsWith("http://")) {
            base = "ws://" + base.substring(7);
        } else if (base.startsWith("https://")) {
            base = "wss://" + base.substring(8);
        }
        
        if (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        
        if (!base.endsWith("/interview/ws") && !base.endsWith("/api/interview/ws")) {
            if (base.endsWith("/api")) {
                base = base + "/interview/ws";
            } else {
                base = base + "/api/interview/ws";
            }
        }
        return base;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession clientSession) throws Exception {
        URI uri = clientSession.getUri();
        if (uri == null) {
            clientSession.close(CloseStatus.BAD_DATA);
            return;
        }

        String query = uri.getQuery();
        String token = null;
        if (query != null && query.contains("token=")) {
            token = UriComponentsBuilder.fromUri(uri).build().getQueryParams().getFirst("token");
        }

        if (token == null || jwtUtil.isExpired(token)) {
            log.warn("WS connection rejected: token missing or expired");
            clientSession.close(CloseStatus.POLICY_VIOLATION);
            return;
        }

        String targetWsUrl = getFastApiWsUrl() + "?token=" + token;
        log.info("Proxying client WS session {} to FastAPI: {}", clientSession.getId(), targetWsUrl);

        StandardWebSocketClient webSocketClient = new StandardWebSocketClient();
        
        WebSocketHandler agentHandler = new TextWebSocketHandler() {
            @Override
            public void afterConnectionEstablished(WebSocketSession agentSession) {
                clientToAgentSessions.put(clientSession, agentSession);
                agentToClientSessions.put(agentSession, clientSession);
                log.info("Established proxy tunnel for client {} to agent {}", clientSession.getId(), agentSession.getId());
            }

            @Override
            protected void handleTextMessage(WebSocketSession agentSession, TextMessage message) throws IOException {
                WebSocketSession client = agentToClientSessions.get(agentSession);
                if (client != null && client.isOpen()) {
                    client.sendMessage(message);
                }
            }

            @Override
            protected void handleBinaryMessage(WebSocketSession agentSession, BinaryMessage message) {
                WebSocketSession client = agentToClientSessions.get(agentSession);
                if (client != null && client.isOpen()) {
                    try {
                        client.sendMessage(message);
                    } catch (IOException e) {
                        throw new RuntimeException(e);
                    }
                }
            }

            @Override
            public void afterConnectionClosed(WebSocketSession agentSession, CloseStatus status) throws Exception {
                WebSocketSession client = agentToClientSessions.remove(agentSession);
                if (client != null) {
                    clientToAgentSessions.remove(client);
                    if (client.isOpen()) {
                        client.close(status);
                    }
                }
                log.info("Agent proxy connection closed: {}", status);
            }
        };

        try {
            webSocketClient.execute(agentHandler, targetWsUrl).get();
        } catch (Exception e) {
            log.error("Failed to connect to agent websocket proxy target: {}", e.getMessage());
            clientSession.close(CloseStatus.SERVER_ERROR);
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession clientSession, TextMessage message) throws IOException {
        WebSocketSession agentSession = clientToAgentSessions.get(clientSession);
        if (agentSession != null && agentSession.isOpen()) {
            agentSession.sendMessage(message);
        }
    }

    @Override
    protected void handleBinaryMessage(WebSocketSession clientSession, BinaryMessage message) {
        WebSocketSession agentSession = clientToAgentSessions.get(clientSession);
        if (agentSession != null && agentSession.isOpen()) {
            try {
                agentSession.sendMessage(message);
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession clientSession, CloseStatus status) throws Exception {
        WebSocketSession agentSession = clientToAgentSessions.remove(clientSession);
        if (agentSession != null) {
            agentToClientSessions.remove(agentSession);
            if (agentSession.isOpen()) {
                agentSession.close(status);
            }
        }
        log.info("Client proxy connection closed: {}", status);
    }
}
