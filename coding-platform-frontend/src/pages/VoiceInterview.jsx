import React, { useState, useEffect, useRef, useCallback } from "react";
import { useApi } from "../hooks/useApi";
import { AGENT, API, LANGUAGES, LANG_STARTERS } from "../utils/constants";
import Editor from "@monaco-editor/react";

// Helper to base64 encode an ArrayBuffer
function base64ArrayBuffer(arrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(arrayBuffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function VoiceInterview({ navigate }) {
  const apiCall = useApi();

  const [phase, setPhase] = useState("setup");
  const [statusText, setStatusText] = useState("Configure your interview to begin.");

  const [jobRole, setJobRole] = useState("Software Engineer");
  const [company, setCompany] = useState("Google");
  const [jobDescription, setJobDescription] = useState("");
  const [duration, setDuration] = useState(15);
  const [resumeFile, setResumeFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [isParsingResume, setIsParsingResume] = useState(false);

  const [sessionId, setSessionId] = useState(null);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [lastTranscripts, setLastTranscripts] = useState([]);

  const [showEditor, setShowEditor] = useState(false);
  const [problemTitle, setProblemTitle] = useState("");
  const [problemDescription, setProblemDescription] = useState("");
  const [code, setCode] = useState("");
  const [languageId, setLanguageId] = useState(71);
  const [stdin, setStdin] = useState("");
  const [consoleOutput, setConsoleOutput] = useState("");
  const [isRunningCode, setIsRunningCode] = useState(false);

  const wsRef = useRef(null);
  // FIX 1: AudioContext must be created at 24000 Hz for PLAYBACK,
  // but the mic capture needs a SEPARATE AudioContext at the native sample rate.
  // Using a single 24000 Hz context for mic input causes the AudioWorklet
  // to receive audio that is already resampled by the browser, breaking
  // the downsampler math. Use two separate contexts.
  const playbackCtxRef = useRef(null);  // 24kHz — for playing Gemini audio
  const captureCtxRef = useRef(null);   // native rate — for mic capture + worklet
  const micStreamRef = useRef(null);
  const workletNodeRef = useRef(null);
  const activeSourcesRef = useRef([]);
  const nextPlaybackTimeRef = useRef(0);
  const reconnectAttemptsRef = useRef(0);
  const phaseRef = useRef("setup"); // FIX 2: phase in closure trap fix
  const sessionIdRef = useRef(null);
  const speakTimeoutRef = useRef(null); // FIX 3: move debounce timeout to ref

  // Keep phaseRef in sync so closures (ws.onclose etc.) read the latest value
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    return () => { cleanupAudioAndSocket(); };
  }, []);

  const cleanupAudioAndSocket = async () => {
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent recovery loop on intentional close
      wsRef.current.close();
      wsRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    activeSourcesRef.current.forEach((src) => { try { src.stop(); } catch (e) { } });
    activeSourcesRef.current = [];

    if (captureCtxRef.current && captureCtxRef.current.state !== "closed") {
      try { await captureCtxRef.current.close(); } catch (e) { }
      captureCtxRef.current = null;
    }
    if (playbackCtxRef.current && playbackCtxRef.current.state !== "closed") {
      try { await playbackCtxRef.current.close(); } catch (e) { }
      playbackCtxRef.current = null;
    }
  };

  const handleResumeChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setResumeFile(file);
    setIsParsingResume(true);
    setStatusText("Extracting resume details...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${AGENT}/agent/resume/extract`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Resume parse failed");
      const data = await res.json();
      const parsedText = `Skills: ${data.skills?.join(", ")}\nExperience Level: ${data.experience_level}\nSummary: ${data.summary}`;
      setResumeText(parsedText);
      setStatusText("Resume parsed successfully!");
    } catch (err) {
      setStatusText("Failed to parse resume. Standard questions will be used.");
      setResumeText("");
    } finally {
      setIsParsingResume(false);
    }
  };

  // FIX 4: bindWsHandlers extracted so reconnection can reuse the exact same
  // handler logic without the stale-closure problem from the original code
  // (ws.onmessage = wsRef.current.onmessage assigned BEFORE wsRef.current was
  // updated — this always bound the OLD socket's handler to the NEW socket).
  const bindWsHandlers = useCallback((ws, sessionToken) => {
    ws.onmessage = async (event) => {
      let textData = event.data;
      if (event.data instanceof Blob) {
        textData = await event.data.text();
      }

      let data;
      try {
        data = JSON.parse(textData);
      } catch (e) {
        console.error("[VoiceInterview] Failed to parse WS message", e);
        return;
      }

      if (data.type === "ready") {
        setSessionId(data.sessionId);
        sessionIdRef.current = data.sessionId;
        setPhase("active");
        phaseRef.current = "active";
        setStatusText("Interview active. Speak when ready.");
        await initAudioPipeline(ws);
      }

      else if (data.type === "status") {
        if (data.status === "reconnecting") {
          setPhase("reconnecting");
          phaseRef.current = "reconnecting";
          setStatusText(data.message || "Reconnecting...");
        } else if (data.status === "resumed") {
          setPhase("active");
          phaseRef.current = "active";
          setStatusText(data.message || "Interview resumed.");
        } else if (data.status === "paused_buffer_full") {
          setStatusText(data.message || "Connection slow. Please pause speaking.");
        }
      }

      else if (data.serverContent) {
        const content = data.serverContent;

        if (content.interrupted) {
          activeSourcesRef.current.forEach((src) => { try { src.stop(); } catch (e) { } });
          activeSourcesRef.current = [];
          if (playbackCtxRef.current) {
            nextPlaybackTimeRef.current = playbackCtxRef.current.currentTime;
          }
          setIsAiSpeaking(false);
        }

        if (content.modelTurn?.parts) {
          for (const part of content.modelTurn.parts) {
            // FIX 5: Gemini Live sends audio as inlineData inside parts.
            // The original code checked part.inlineData correctly, but
            // playAudioChunk received a raw ArrayBuffer from base64ToArrayBuffer.
            // The bug: base64ToArrayBuffer returns bytes.buffer which is the
            // FULL underlying ArrayBuffer of the Uint8Array — if the Uint8Array
            // is a view into a larger buffer, you get extra silence/garbage.
            // Fix: slice the buffer to guarantee correct bounds.
            if (part.inlineData?.data) {
              const raw = base64ToArrayBuffer(part.inlineData.data);
              playAudioChunk(raw);
            }
            if (part.text) {
              setLastTranscripts((prev) => {
                const others = prev.filter((t) => t.role !== "model");
                return [...others, { role: "model", text: part.text }];
              });
            }
          }
        }

        // FIX 6: Gemini also sends transcripts of the USER's speech via
        // serverContent.inputTranscript — the original code never handled this,
        // so the "You:" side of the transcript was always blank.
        if (content.inputTranscript) {
          setIsUserSpeaking(false);
          setLastTranscripts((prev) => {
            const others = prev.filter((t) => t.role !== "user");
            return [...others, { role: "user", text: content.inputTranscript }];
          });
        }
      }

      else if (data.toolCall?.functionCalls) {
        for (const call of data.toolCall.functionCalls) {
          if (call.name === "show_coding_editor") {
            const args = call.args;
            setProblemTitle(args.problem_title);
            setProblemDescription(args.problem_description);
            setCode(args.starter_code);
            const matchedLang = LANGUAGES.find((l) =>
              l.name.toLowerCase().includes(args.programming_languages?.[0]?.toLowerCase())
            );
            if (matchedLang) setLanguageId(matchedLang.id);
            setShowEditor(true);

            ws.send(JSON.stringify({
              toolResponse: {
                functionResponses: [{
                  name: "show_coding_editor",
                  id: call.id,
                  response: { status: "editor_opened" }
                }]
              }
            }));
          }
        }
      }
    };

    ws.onclose = () => {
      console.log("[VoiceInterview] WebSocket closed. Phase:", phaseRef.current);
      if (phaseRef.current !== "setup" && phaseRef.current !== "finished") {
        handleWebSocketRecovery(sessionToken);
      }
    };

    ws.onerror = (err) => {
      console.error("[VoiceInterview] WebSocket error", err);
    };
  }, []);

  const handleStartInterview = async () => {
    setPhase("connecting");
    setStatusText("Initiating connection...");
    reconnectAttemptsRef.current = 0;

    try {
      const tokenRes = await apiCall("/api/interviews/session-token", { method: "POST" });
      const sessionToken = tokenRes.token;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const wsUrl = `ws://localhost:8001/api/interview/ws?token=${sessionToken}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[VoiceInterview] WS open. Sending start handshake.");
        ws.send(JSON.stringify({
          type: "start",
          resume: resumeText,
          jobRole,
          jobDescription,
          company,
          duration,
        }));
      };

      bindWsHandlers(ws, sessionToken);
    } catch (err) {
      console.error(err);
      setPhase("setup");
      setStatusText(err.message || "Failed to start. Check microphone permissions.");
    }
  };

  const handleWebSocketRecovery = async (sessionToken) => {
    if (reconnectAttemptsRef.current >= 5) {
      setPhase("finished");
      phaseRef.current = "finished";
      setStatusText("Connection lost. Generating your evaluation report...");
      setTimeout(() => navigate("/profile"), 4000);
      return;
    }

    setPhase("reconnecting");
    phaseRef.current = "reconnecting";
    reconnectAttemptsRef.current += 1;
    const delay = Math.min(Math.pow(2, reconnectAttemptsRef.current), 8) * 1000;
    console.log(`[VoiceInterview] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/5)`);

    await new Promise((r) => setTimeout(r, delay));

    try {
      const wsUrl = `ws://localhost:8001/api/interview/ws?token=${sessionToken}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[VoiceInterview] Reconnected. Sending restore handshake.");
        ws.send(JSON.stringify({
          type: "reconnect",
          sessionId: sessionIdRef.current,
        }));
        reconnectAttemptsRef.current = 0;
      };

      // FIX 4 payoff: bindWsHandlers is called fresh here, not copying
      // a stale handler reference from the old dead socket.
      bindWsHandlers(ws, sessionToken);
    } catch (e) {
      handleWebSocketRecovery(sessionToken);
    }
  };

  // FIX 1 payoff: initAudioPipeline now takes the ws instance directly
  // so it doesn't rely on wsRef.current inside the worklet message closure
  // (wsRef.current could change during reconnection while the worklet is running).
  const initAudioPipeline = async (ws) => {
    // Capture context: use the browser's NATIVE sample rate so the
    // AudioWorklet's `sampleRate` global returns the true mic rate (44100/48000).
    // The worklet then downsamples to 16kHz correctly.
    if (!captureCtxRef.current) {
      captureCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const capCtx = captureCtxRef.current;
    if (capCtx.state === "suspended") await capCtx.resume();

    // Playback context: 24kHz to match Gemini's output sample rate exactly.
    if (!playbackCtxRef.current) {
      playbackCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000,
      });
    }
    const playCtx = playbackCtxRef.current;
    if (playCtx.state === "suspended") await playCtx.resume();

    nextPlaybackTimeRef.current = playCtx.currentTime;

    await capCtx.audioWorklet.addModule("/audio-processor.js");
    const workletNode = new AudioWorkletNode(capCtx, "audio-processor");
    workletNodeRef.current = workletNode;

    const source = capCtx.createMediaStreamSource(micStreamRef.current);
    source.connect(workletNode);

    workletNode.port.onmessage = (event) => {
      const pcmBuffer = event.data;
      // FIX 7: Only send audio when the ACTIVE ws instance is open.
      // Original code checked wsRef.current which could be a reconnecting socket.
      if (ws.readyState === WebSocket.OPEN && phaseRef.current === "active") {
        const base64 = base64ArrayBuffer(pcmBuffer);
        wsRef.current?.send(JSON.stringify({
          realtimeInput: {
            mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: base64 }]
          }
        }));
        setIsUserSpeaking(true);
        clearTimeout(speakTimeoutRef.current);
        speakTimeoutRef.current = setTimeout(() => setIsUserSpeaking(false), 1000);
      }
    };
  };

  const playAudioChunk = (arrayBuffer) => {
    const audioCtx = playbackCtxRef.current;
    if (!audioCtx || audioCtx.state === "closed") return;

    const int16 = new Int16Array(arrayBuffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    // FIX 8: createBuffer's sampleRate arg must match the playbackCtx rate (24000).
    // Original code used audioCtxRef which was a single 24000 Hz context — but
    // since we now have two contexts, always use playbackCtxRef explicitly here.
    const audioBuffer = audioCtx.createBuffer(1, float32.length, 24000);
    audioBuffer.getChannelData(0).set(float32);

    const sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(audioCtx.destination);

    activeSourcesRef.current.push(sourceNode);
    setIsAiSpeaking(true);

    sourceNode.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((n) => n !== sourceNode);
      if (activeSourcesRef.current.length === 0) setIsAiSpeaking(false);
    };

    const startTime = Math.max(nextPlaybackTimeRef.current, audioCtx.currentTime);
    sourceNode.start(startTime);
    nextPlaybackTimeRef.current = startTime + audioBuffer.duration;
  };

  const handleRunCode = async () => {
    if (isRunningCode) return;
    setIsRunningCode(true);
    setConsoleOutput("Compiling and executing...");
    try {
      const result = await apiCall("/api/submissions/execute", {
        method: "POST",
        body: { sourceCode: code, languageId, stdin },
      });

      let out = "";
      if (result.compileOutput) out += `[Compile]:\n${result.compileOutput}\n`;
      if (result.stderr) out += `[Errors]:\n${result.stderr}\n`;
      out += `[Output]:\n${result.stdout || ""}\nExit: ${result.exitCode}  Runtime: ${result.runtimeMs}ms`;
      setConsoleOutput(out);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "codeSubmission",
          code,
          language: LANGUAGES.find((l) => l.id === languageId)?.name || "Unknown",
          result: {
            stdout: result.stdout || "",
            stderr: result.stderr || "",
            compileOutput: result.compileOutput || "",
            exitCode: result.exitCode,
          },
        }));
      }
    } catch (err) {
      setConsoleOutput(`Execution failed: ${err.message}`);
    } finally {
      setIsRunningCode(false);
    }
  };

  const handleEndInterview = async () => {
    wsRef.current?.send(JSON.stringify({ type: "endInterview" }));
    setPhase("finished");
    phaseRef.current = "finished";
    setStatusText("Interview concluded! Generating your evaluation report...");
    await cleanupAudioAndSocket();
    setTimeout(() => navigate("/profile"), 4500);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="container" style={{ maxWidth: 800, marginTop: 40, paddingBottom: 60 }}>
        <div className="card" style={{ padding: 32, background: "rgba(255,255,255,0.03)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <h2 style={{ marginBottom: 8, fontSize: "1.8rem", fontWeight: 700, color: "var(--accent)" }}>AI Real-time Mock Interview</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 24 }}>
            Upload your resume, configure the target role, and conduct a realistic low-latency voice interview with follow-up coding challenges.
          </p>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="label">Upload Resume (PDF / DOCX)</label>
            <input type="file" className="input" accept=".pdf,.docx,.txt" onChange={handleResumeChange} disabled={isParsingResume} />
            {isParsingResume && <span className="helper" style={{ color: "var(--amber)" }}>Analyzing resume...</span>}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="form-group">
              <label className="label">Target Job Title</label>
              <input type="text" className="input" value={jobRole} onChange={(e) => setJobRole(e.target.value)} placeholder="e.g. Backend Engineer" />
            </div>
            <div className="form-group">
              <label className="label">Company Name</label>
              <input type="text" className="input" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Netflix" />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="label">Job Description / Requirements</label>
            <textarea className="input" style={{ height: 120, resize: "none" }} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="Paste the job description to steer the technical questions..." />
          </div>

          <div className="form-group" style={{ marginBottom: 28 }}>
            <label className="label">Interview Duration (Minutes)</label>
            <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              <option value={10}>10 Minutes (HR / Resume only)</option>
              <option value={15}>15 Minutes (HR + 1 Coding problem)</option>
              <option value={30}>30 Minutes (Complete technical panel)</option>
            </select>
          </div>

          <button className="btn btn-primary" style={{ width: "100%", padding: 14, fontSize: "1rem", fontWeight: 600 }} onClick={handleStartInterview} disabled={isParsingResume}>
            Start Mock Interview
          </button>
        </div>
      </div>
    );
  }

  if (phase === "connecting" || phase === "finished" || phase === "reconnecting") {
    return (
      <div className="container" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "70vh" }}>
        <div style={{ position: "relative", width: 100, height: 100, marginBottom: 32 }}>
          <div className="spinner" style={{ borderTopColor: "var(--accent)" }} />
        </div>
        <h3 style={{ fontSize: "1.3rem", fontWeight: 600, color: "var(--text)" }}>{statusText}</h3>
        {phase === "reconnecting" && <p style={{ color: "var(--text-muted)", marginTop: 8 }}>Please do not refresh the page.</p>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "calc(100vh - 64px)", overflow: "hidden" }}>
      {/* Left: Voice panel */}
      <div style={{ flex: showEditor ? "0 0 35%" : "1 1 100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", padding: 40, background: "rgba(255,255,255,0.01)", borderRight: showEditor ? "1px solid rgba(255,255,255,0.08)" : "none", transition: "flex 0.4s ease" }}>
        <div style={{ width: "100%", textAlign: "center" }}>
          <h2 style={{ fontSize: "1.4rem", color: "var(--text)", fontWeight: 700 }}>Interviewing for {jobRole}</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>{company} Panel</p>
        </div>

        <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isAiSpeaking && <div style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", background: "rgba(99,102,241,0.15)", animation: "pulse 2s infinite" }} />}
          {isUserSpeaking && <div style={{ position: "absolute", width: "100%", height: "100%", borderRadius: "50%", background: "rgba(16,185,129,0.15)", animation: "pulse 2.2s infinite" }} />}
          <div style={{ width: 120, height: 120, borderRadius: "50%", background: isAiSpeaking ? "linear-gradient(135deg, var(--accent) 0%, #4f46e5 100%)" : isUserSpeaking ? "linear-gradient(135deg, #10b981 0%, #059669 100%)" : "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: (isAiSpeaking || isUserSpeaking) ? "0 0 30px rgba(99,102,241,0.4)" : "none", transition: "all 0.5s ease" }}>
            <span style={{ fontSize: "2rem" }}>{isAiSpeaking ? "🎙️" : isUserSpeaking ? "🗣️" : "⏸️"}</span>
          </div>
        </div>

        <div style={{ width: "100%", textAlign: "center" }}>
          <p style={{ fontWeight: 600, fontSize: "1rem", color: isAiSpeaking ? "var(--accent)" : isUserSpeaking ? "#10b981" : "var(--text-muted)" }}>
            {isAiSpeaking ? "Interviewer is speaking..." : isUserSpeaking ? "Listening to you..." : "Quiet..."}
          </p>

          <div style={{ marginTop: 20, padding: 16, background: "rgba(255,255,255,0.02)", borderRadius: 8, minHeight: 80, textAlign: "left", maxHeight: 120, overflowY: "auto", border: "1px solid rgba(255,255,255,0.04)" }}>
            {lastTranscripts.length === 0
              ? <span className="helper" style={{ color: "var(--text-muted)" }}>Conversation will appear here.</span>
              : lastTranscripts.map((t, idx) => (
                <div key={idx} style={{ marginBottom: 6, fontSize: "0.85rem" }}>
                  <strong style={{ color: t.role === "model" ? "var(--accent)" : "#10b981" }}>
                    {t.role === "model" ? "Interviewer: " : "You: "}
                  </strong>
                  <span style={{ color: "var(--text)" }}>{t.text}</span>
                </div>
              ))
            }
          </div>

          <button className="btn btn-ghost" style={{ marginTop: 24, width: "100%", border: "1px solid var(--red)", color: "var(--red)" }} onClick={handleEndInterview}>
            Conclude & Get Feedback
          </button>
        </div>
      </div>

      {/* Right: Editor panel */}
      {showEditor && (
        <div style={{ flex: "1 1 65%", display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ padding: 20, borderBottom: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.01)" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)" }}>{problemTitle}</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", whiteSpace: "pre-line", marginTop: 8, maxHeight: 180, overflowY: "auto" }}>{problemDescription}</p>
          </div>

          <div style={{ flex: 1, position: "relative" }}>
            <Editor
              theme="vs-dark"
              language={LANGUAGES.find((l) => l.id === languageId)?.name.toLowerCase().split(" ")[0] || "python"}
              value={code}
              onChange={(val) => setCode(val)}
              options={{ minimap: { enabled: false }, fontSize: 14, scrollbar: { vertical: "visible", horizontal: "visible" }, padding: { top: 12, bottom: 12 } }}
            />
          </div>

          <div style={{ height: "30%", minHeight: 200, display: "flex", flexDirection: "column", borderTop: "1px solid rgba(255,255,255,0.08)", background: "#0b0c10" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span className="label" style={{ margin: 0 }}>Language:</span>
                <select className="input" style={{ width: 140, padding: "4px 8px", fontSize: "0.85rem" }} value={languageId} onChange={(e) => { const id = Number(e.target.value); setLanguageId(id); setCode(LANG_STARTERS[id] || ""); }}>
                  {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleRunCode} disabled={isRunningCode}>
                {isRunningCode ? "Running..." : "Run Code"}
              </button>
            </div>

            <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
              <div style={{ flex: 1, padding: 16, borderRight: "1px solid rgba(255,255,255,0.04)", display: "flex", flexDirection: "column" }}>
                <span className="label" style={{ fontSize: "0.8rem", marginBottom: 6 }}>Custom Input (stdin):</span>
                <textarea className="input" style={{ flex: 1, resize: "none", background: "rgba(255,255,255,0.02)", fontFamily: "monospace", fontSize: "0.85rem", padding: 8 }} value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder="Input args..." />
              </div>
              <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", background: "#060709" }}>
                <span className="label" style={{ fontSize: "0.8rem", marginBottom: 6 }}>Console Output:</span>
                <pre style={{ flex: 1, margin: 0, overflowY: "auto", fontFamily: "monospace", fontSize: "0.85rem", color: consoleOutput.includes("[Errors]") ? "var(--red)" : "var(--green)", whiteSpace: "pre-wrap", background: "transparent" }}>
                  {consoleOutput || "Output will appear here after running."}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}