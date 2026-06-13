import os
import json
import logging
import asyncio
import time
import httpx
import jwt
import redis
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

# Constants
JWT_SECRET = os.getenv("JWT_SECRET", "L9QTAMFyX7W53pz51hokMUPqZlvXlxAE")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY_INTERVIEW")
SPRING_URL = os.getenv("SPRING_BOOT_URL", "http://localhost:8080")
GEMINI_LIVE_MODEL = "models/gemini-2.5-flash-native-audio-latest"

# Redis initialization with fallback to in-memory dict
redis_host = os.getenv("REDIS_HOST", "localhost")
redis_port = int(os.getenv("REDIS_PORT", 6379))
redis_password = os.getenv("REDIS_PASSWORD", None)

try:
    redis_client = redis.Redis(
        host=redis_host,
        port=redis_port,
        password=redis_password,
        decode_responses=True,
        socket_timeout=2
    )
    # Test connection
    redis_client.ping()
    logger.info("✓ Connected to Redis for interview session storage.")
except Exception as e:
    logger.warning(f"⚠ Redis not available ({e}). Falling back to thread-safe in-memory session storage.")
    redis_client = None

# Thread-safe in-memory fallback store
in_memory_store = {}
memory_lock = asyncio.Lock()


# Stateless JWT Verification
def verify_session_token(token: str) -> dict:
    """Decodes JWT session token statelessly."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        if payload.get("purpose") != "voice_interview":
            raise ValueError("Token purpose mismatch")
        return payload
    except Exception as e:
        logger.error(f"JWT verification failed: {e}")
        return None


# Session State Manager
class SessionStore:
    @staticmethod
    async def get(session_id: str) -> dict:
        if redis_client:
            try:
                data = redis_client.get(f"interview_session:{session_id}")
                return json.loads(data) if data else None
            except Exception as e:
                logger.error(f"Redis error get: {e}")
        async with memory_lock:
            return in_memory_store.get(session_id)

    @staticmethod
    async def set(session_id: str, data: dict):
        if redis_client:
            try:
                redis_client.setex(
                    f"interview_session:{session_id}",
                    7200,  # 2 hours expiry
                    json.dumps(data)
                )
                return
            except Exception as e:
                logger.error(f"Redis error set: {e}")
        async with memory_lock:
            in_memory_store[session_id] = data

    @staticmethod
    async def update(session_id: str, updates: dict):
        session = await SessionStore.get(session_id) or {}
        session.update(updates)
        await SessionStore.set(session_id, session)


# Resume Pre-Summarizer
async def pre_summarize_resume(resume_text: str) -> dict:
    """Pre-summarizes raw resume text into clean, structured JSON to preserve token count."""
    if not resume_text or not resume_text.strip():
        return {"skills": [], "experience_level": "Entry-Level", "preferred_roles": ["Software Engineer"], "summary": "No resume uploaded."}
    
    prompt = f"""
    Analyze the following resume text and summarize it into a structured JSON object.
    
    Resume Text:
    {resume_text}
    
    Return ONLY a JSON object matching this schema:
    {{
      "skills": ["List of core technical skills"],
      "experience_level": "Entry-Level | Mid-Level | Senior | Lead",
      "preferred_roles": ["Possible job roles"],
      "summary": "2-sentence professional overview"
    }}
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            res = await client.post(url, json=payload)
            res.raise_for_status()
            result_json = res.json()
            text_response = result_json["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text_response.strip())
    except Exception as e:
        logger.error(f"Failed to pre-summarize resume: {e}")
        # Return graceful default fallback
        return {
            "skills": ["General Software Engineering"],
            "experience_level": "Mid-Level",
            "preferred_roles": ["Software Engineer"],
            "summary": "Unable to parse resume details."
        }


# Post-Interview Evaluation Report generator
async def run_post_interview_evaluation(session_id: str, jwt_token: str):
    """Triggered in background when the session ends. Calls Gemini REST API to assess transcript & code runs."""
    session = await SessionStore.get(session_id)
    if not session:
        logger.error(f"Cannot run evaluation. Session {session_id} not found.")
        return
        
    history = session.get("history", [])
    submissions = session.get("codeSubmissions", [])
    
    # Construct a readable transcript
    transcript_lines = []
    for turn in history:
        role = "AI" if turn.get("role") == "model" else "Candidate"
        text = turn.get("text", "")
        if text:
            transcript_lines.append(f"{role}: {text}")
            
    transcript_text = "\n".join(transcript_lines)
    
    # Construct code submissions block
    code_blocks = []
    for i, sub in enumerate(submissions):
        result = sub.get("result", {})
        code_blocks.append(
            f"--- Code Run #{i+1} ({sub.get('language')}) ---\n"
            f"Code:\n{sub.get('code')}\n"
            f"Stdout: {result.get('stdout')}\n"
            f"Stderr: {result.get('stderr')}\n"
            f"Compile Output: {result.get('compileOutput')}\n"
            f"Exit Code: {result.get('exitCode')}\n"
        )
    code_text = "\n".join(code_blocks) if code_blocks else "No code was run."

    prompt = f"""
    You are an expert technical interviewer and recruiter. Analyze the following transcript and code submissions of a mock technical interview.
    Evaluate the candidate fairly and output a structured performance report in JSON.
    
    Candidate Resume Summary:
    {json.dumps(session.get('resumeSummary', {}))}
    
    Target Job: {session.get('role')} at {session.get('company')}
    
    Interview Transcript:
    {transcript_text}
    
    Code Runs/Submissions:
    {code_text}
    
    Generate a JSON output matching exactly this schema:
    {{
      "overallScore": 0.0,
      "technicalScore": 0.0,
      "communicationScore": 0.0,
      "strengths": ["list of 2-3 key strengths"],
      "weaknesses": ["list of 2-3 areas of improvement"],
      "codingFeedback": "Evaluation of their coding style, logic, bugs, and run outcomes.",
      "behavioralFeedback": "Evaluation of their HR questions, background explanation, and communication clarity."
    }}
    """
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json"
        }
    }
    
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(url, json=payload)
            res.raise_for_status()
            result_json = res.json()
            eval_text = result_json["candidates"][0]["content"]["parts"][0]["text"]
            eval_data = json.loads(eval_text.strip())
            
            # Post the report back to Spring Boot
            save_payload = {
                "role": session.get("role"),
                "company": session.get("company"),
                "overallScore": eval_data.get("overallScore", 0.0),
                "technicalScore": eval_data.get("technicalScore", 0.0),
                "communicationScore": eval_data.get("communicationScore", 0.0),
                "feedbackJson": eval_text.strip()
            }
            
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {jwt_token}"
            }
            
            post_res = await client.post(
                f"{SPRING_URL}/api/interviews/evaluation",
                json=save_payload,
                headers=headers
            )
            post_res.raise_for_status()
            logger.info(f"✓ Mock interview report saved to Spring Boot database for session {session_id}")
    except Exception as e:
        logger.error(f"Failed to generate or save post-interview evaluation report: {e}")

# Helper to build system instructions
def build_system_instruction(role: str, company: str, duration: int, resume_summary: dict) -> str:
    return f"""
    You are an expert AI recruiter conducting a technical and HR mock interview.
    Role: {role}
    Company: {company}
    Duration: {duration} minutes
    
    Resume summary of applicant:
    {json.dumps(resume_summary)}
    
    Structure the interview strictly:
    1. HR / Resume Intro: First 15% of time. Ask about their projects, background.
    2. Live Coding challenge: Next 65% of time. You MUST call the 'show_coding_editor' tool to present a relevant coding problem. Ask them to explain as they write. Guide them, discuss complexities.
    3. Behavioral & Wrap-up: Final 20% of time. Invite questions.
    
    Guidelines:
    - Communicate ONLY in audio. Modality is set to AUDIO. Speak in a realistic, professional tone.
    - Be responsive to barge-in interruptions. Stop talking instantly.
    - React dynamically when the system informs you of code submissions or timers.
    """

# Background timekeeper loop
async def timekeeper_loop(session_id: str, gemini_ws_ref: dict, duration_mins: int):
    start_time = time.time()
    checkpoints = {
        5 * 60: "[SYSTEM: HR intro phase complete. Transition to technical phase now. Call show_coding_editor tool with a coding question matching the job role.]",
        20 * 60: "[SYSTEM: 20 minutes elapsed. Inform the candidate to wrap up their code logic, discuss space/time complexity, and close the editor.]",
        25 * 60: "[SYSTEM: 25 minutes elapsed. Start wrap-up. Ask the candidate if they have questions for you.]",
        30 * 60: "[SYSTEM: Time is up. Conclude the interview and say goodbye. The session will disconnect.]"
    }
    
    scale = (duration_mins * 60) / (30 * 60)
    scaled_checkpoints = {int(k * scale): v for k, v in checkpoints.items()}
    triggered = set()
    
    try:
        while True:
            await asyncio.sleep(10)
            elapsed = time.time() - start_time
            
            for threshold, hint in list(scaled_checkpoints.items()):
                if elapsed >= threshold and threshold not in triggered:
                    triggered.add(threshold)
                    logger.info(f"Timekeeper triggered checkpoint {threshold}s for session {session_id}.")
                    
                    hint_turn = {
                        "clientContent": {
                            "turns": [
                                {
                                    "role": "user",
                                    "parts": [{"text": hint}]
                                }
                            ],
                            "turnComplete": True
                        }
                    }
                    active_ws = gemini_ws_ref.get("ws")
                    if active_ws:
                        try:
                            await active_ws.send(json.dumps(hint_turn))
                        except Exception as e:
                            logger.error(f"Timekeeper failed to send hint to Gemini: {e}")
                            
            if elapsed >= duration_mins * 60 + 30:
                break
    except asyncio.CancelledError:
        pass

# Bidirectional WS connection proxy
async def interview_websocket_endpoint(websocket: WebSocket):
    # Retrieve & verify token from query parameters
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return
        
    payload = verify_session_token(token)
    if not payload:
        await websocket.close(code=1008, reason="Invalid token")
        return
        
    user_id = payload.get("sub")
    email = payload.get("email")
    role_type = payload.get("role")
    
    # Check origin
    origin = websocket.headers.get("origin")
    allowed_origins = ["http://localhost:8080", "http://localhost:3000", "http://localhost:5173"]
    if origin and origin not in allowed_origins:
        await websocket.close(code=1008, reason="CORS policy violation")
        return

    await websocket.accept()
    
    gemini_uri = f"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"
    gemini_ws = None
    gemini_ws_ref = {"ws": None}
    session_id = None
    timekeeper_task = None
    
    # Connection variables
    reconnecting = False
    mic_audio_buffer = bytearray()
    
    try:
        # 1. Read first message (handshake/start metadata)
        msg_str = await websocket.receive_text()
        initial_data = json.loads(msg_str)
        
        import uuid
        if initial_data.get("type") == "start":
            session_id = str(uuid.uuid4())
            logger.info(f"Starting new interview session {session_id} for user {user_id}")
            
            # Pre-summarize resume to conserve tokens
            raw_resume = initial_data.get("resume", "")
            resume_summary = await pre_summarize_resume(raw_resume)
            
            session_data = {
                "userId": user_id,
                "role": initial_data.get("jobRole", "Software Engineer"),
                "company": initial_data.get("company", "Google"),
                "duration": int(initial_data.get("duration", 30)),
                "resumeSummary": resume_summary,
                "history": [],
                "codeSubmissions": []
            }
            await SessionStore.set(session_id, session_data)
        elif initial_data.get("type") == "reconnect":
            session_id = initial_data.get("sessionId")
            session_data = await SessionStore.get(session_id)
            if not session_data or session_data.get("userId") != user_id:
                await websocket.close(code=1008, reason="Session not found or expired")
                return
            logger.info(f"Reconnecting to existing interview session {session_id} for user {user_id}")
            reconnecting = True
        else:
            await websocket.close(code=1008, reason="Invalid handshake message")
            return
            
        # 2. Connect to Gemini Live WSS
        import websockets
        async def connect_to_gemini():
            try:
                ws = await websockets.connect(gemini_uri)
                # Send setup configuration
                setup_payload = {
                    "setup": {
                        "model": GEMINI_LIVE_MODEL,
                        "generationConfig": {
                            "responseModalities": ["AUDIO"]
                        },
                        "systemInstruction": {
                            "parts": [{"text": build_system_instruction(
                                session_data.get("role"),
                                session_data.get("company"),
                                session_data.get("duration"),
                                session_data.get("resumeSummary")
                            )}]
                        },
                        "tools": [{
                            "functionDeclarations": [{
                                "name": "show_coding_editor",
                                "description": "Expose a side-by-side Monaco code editor to the user with a specific coding question.",
                                "parameters": {
                                    "type": "OBJECT",
                                    "properties": {
                                        "problem_title": {"type": "STRING", "description": "The title of the coding problem."},
                                        "problem_description": {"type": "STRING", "description": "Clear description of the coding question, constraints, inputs/outputs, and examples."},
                                        "starter_code": {"type": "STRING", "description": "Starter template code for the user to complete."},
                                        "programming_languages": {"type": "ARRAY", "items": {"type": "STRING"}, "description": "Supported languages (e.g. ['python', 'java', 'javascript'])." }
                                    },
                                    "required": ["problem_title", "problem_description", "starter_code", "programming_languages"]
                                }
                            }]
                        }]
                    }
                }
                await ws.send(json.dumps(setup_payload))
                
                # If restoring, play back context and warning instruction
                if reconnecting:
                    restore_prompt = "[SYSTEM: This is a session restore. You have been provided prior context. Do NOT reference the reconnection or repeat any prior questions. Continue naturally from where the interview left off.]"
                    restore_payload = {
                        "clientContent": {
                            "turns": [{"role": "user", "parts": [{"text": restore_prompt}]}],
                            "turnComplete": True
                        }
                    }
                    await ws.send(json.dumps(restore_payload))
                    
                    # Send history
                    for turn in session_data.get("history", []):
                        turn_payload = {
                            "clientContent": {
                                "turns": [{"role": turn.get("role"), "parts": [{"text": turn.get("text")}]}],
                                "turnComplete": True
                            }
                        }
                        await ws.send(json.dumps(turn_payload))
                return ws
            except Exception as e:
                logger.error(f"Failed to connect to Gemini Live WSS: {e}")
                return None

        gemini_ws = await connect_to_gemini()
        if not gemini_ws:
            await websocket.close(code=1011, reason="Gemini Live API unavailable")
            return
            
        gemini_ws_ref["ws"] = gemini_ws
        
        # Send handshake success to client
        await websocket.send_text(json.dumps({"type": "ready", "sessionId": session_id}))
        
        # Start Timekeeper loop
        timekeeper_task = asyncio.create_task(timekeeper_loop(session_id, gemini_ws_ref, session_data.get("duration")))

        # Bidirectional forwarder loops
        async def client_to_gemini_loop():
            nonlocal gemini_ws, reconnecting, mic_audio_buffer
            try:
                async for message in websocket.iter_text():
                    data = json.loads(message)
                    msg_type = data.get("type")
                    
                    # Intercept code executions
                    if msg_type == "codeSubmission":
                        code = data.get("code", "")
                        lang = data.get("language", "")
                        run_result = data.get("result", {})
                        
                        logger.info(f"Received codeSubmission from client for session {session_id}")
                        # Append code submission history
                        submissions = session_data.get("codeSubmissions", [])
                        submissions.append({
                            "code": code,
                            "language": lang,
                            "result": run_result,
                            "timestamp": time.time()
                        })
                        session_data["codeSubmissions"] = submissions
                        await SessionStore.set(session_id, session_data)
                        
                        # Forward a system hint to Gemini so it has visibility over code output
                        hint_text = (
                            f"[SYSTEM HINT: Candidate just executed code.\n"
                            f"Language: {lang}\n"
                            f"Code:\n{code}\n"
                            f"Execution stdout: {run_result.get('stdout')}\n"
                            f"Execution stderr: {run_result.get('stderr')}\n"
                            f"Exit code: {run_result.get('exitCode')}]"
                        )
                        hint_payload = {
                            "clientContent": {
                                "turns": [{"role": "user", "parts": [{"text": hint_text}]}],
                                "turnComplete": False
                            }
                        }
                        if gemini_ws and not reconnecting:
                            await gemini_ws.send(json.dumps(hint_payload))
                            
                    # Intercept manual interview end
                    elif msg_type == "endInterview":
                        logger.info(f"User requested immediate interview wrap-up for session {session_id}")
                        break
                        
                    # Standard audio packets or tool responses
                    else:
                        # If reconnecting/disconnected, buffer audio
                        if reconnecting or not gemini_ws:
                            if "realtimeInput" in data:
                                chunks = data["realtimeInput"].get("mediaChunks", [])
                                for ch in chunks:
                                    if ch.get("data"):
                                        import base64
                                        chunk_bytes = base64.b64decode(ch.get("data"))
                                        
                                        # Hard buffer limit: 15 seconds (16kHz PCM Int16 = 32KB/s => 480KB max)
                                        if len(mic_audio_buffer) < 480000:
                                            mic_audio_buffer.extend(chunk_bytes)
                                        else:
                                            # Drop packets and notify client to wait
                                            await websocket.send_text(json.dumps({
                                                "type": "status",
                                                "status": "paused_buffer_full",
                                                "message": "Reconnecting. Please pause speaking temporarily."
                                            }))
                        else:
                            # Forward as-is
                            # If it's a toolResponse, log it to history
                            if "toolResponse" in data:
                                # Tool response ack
                                logger.info(f"Forwarding toolResponse from client to Gemini: {data}")
                            await gemini_ws.send(message)
            except Exception as e:
                logger.error(f"Error in client_to_gemini loop: {e}")

        async def gemini_to_client_loop():
            nonlocal gemini_ws, reconnecting, mic_audio_buffer
            try:
                while True:
                    if reconnecting or not gemini_ws:
                        # Attempt Gemini connection recovery
                        logger.warning("Gemini Live connection dropped. Reconnecting...")
                        await websocket.send_text(json.dumps({
                            "type": "status",
                            "status": "reconnecting",
                            "message": "Interview connection lost. Attempting to restore..."
                        }))
                        
                        # Connect with backoff
                        for attempt in range(5):
                            await asyncio.sleep(min(2 ** attempt, 8))
                            gemini_ws = await connect_to_gemini()
                            if gemini_ws:
                                gemini_ws_ref["ws"] = gemini_ws
                                break
                        
                        if not gemini_ws:
                            # Reconnection failed
                            logger.error("Gemini Live reconnection failed.")
                            await websocket.send_text(json.dumps({
                                "type": "status",
                                "status": "failed",
                                "message": "Failed to restore interview session."
                            }))
                            await websocket.close(code=1011, reason="Gemini connection lost")
                            return
                            
                        # Flushes buffered mic audio
                        if mic_audio_buffer:
                            logger.info(f"Flushing {len(mic_audio_buffer)} bytes of buffered audio to recovered Gemini session.")
                            import base64
                            audio_b64 = base64.b64encode(mic_audio_buffer).decode("utf-8")
                            flush_payload = {
                                "realtimeInput": {
                                    "mediaChunks": [
                                        {
                                            "mimeType": "audio/pcm;rate=16000",
                                            "data": audio_b64
                                        }
                                    ]
                                }
                            }
                            await gemini_ws.send(json.dumps(flush_payload))
                            mic_audio_buffer = bytearray()
                            
                        reconnecting = False
                        await websocket.send_text(json.dumps({
                            "type": "status",
                            "status": "resumed",
                            "message": "Connection restored. Resuming interview."
                        }))
                    
                    try:
                        message = await gemini_ws.recv()
                        if isinstance(message, bytes):
                            message = message.decode("utf-8")
                        data = json.loads(message)
                        
                        # Log conversation history text
                        if "serverContent" in data:
                            content = data["serverContent"]
                            if "modelTurn" in content:
                                text_parts = []
                                parts = content["modelTurn"].get("parts", [])
                                for p in parts:
                                    if "text" in p:
                                        text_parts.append(p["text"])
                                if text_parts:
                                    full_text = "".join(text_parts)
                                    # Append model text to history
                                    history = session_data.get("history", [])
                                    history.append({"role": "model", "text": full_text})
                                    session_data["history"] = history
                                    await SessionStore.set(session_id, session_data)
                                    
                        # Forward message to client
                        await websocket.send_text(message)
                    except Exception as conn_err:
                        logger.warning(f"Connection error in gemini receive: {conn_err}")
                        gemini_ws = None
                        gemini_ws_ref["ws"] = None
                        reconnecting = True
            except Exception as e:
                logger.error(f"Error in gemini_to_client loop: {e}")

        # Run loops concurrently
        await asyncio.gather(client_to_gemini_loop(), gemini_to_client_loop())

    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected for session {session_id}")
    except Exception as e:
        logger.error(f"WebSocket handler error: {e}")
    finally:
        # Cleanup
        if timekeeper_task:
            timekeeper_task.cancel()
        if gemini_ws:
            try:
                await gemini_ws.close()
            except Exception:
                pass
                
        # Trigger background post-interview evaluation report
        if session_id:
            asyncio.create_task(run_post_interview_evaluation(session_id, token))
