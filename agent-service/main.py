import os
import logging
import asyncio
import json
import uuid
from typing import Optional
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

import redis.asyncio as aioredis
from fastapi import FastAPI, HTTPException, WebSocket, Depends
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from schemas.problem import GenerateRequest, GenerateResponse, GeneratedProblem, Difficulty
from core.pipeline import problem_pipeline
from core.publisher import publish_problem
from core.state import ProblemState
from core.auth import verify_admin_token

from fastapi import UploadFile, File
from pydantic import BaseModel
from schemas.resume import ExtractedSkills, JobMatchResponse
from agents.resume_agent import extract_text_from_file, extract_skills_from_text
from core.job_fetcher import retrieve_all_jobs
from core.matchmaker import match_jobs_with_llm
from core.interview import interview_websocket_endpoint

# ── Constants ──────────────────────────────────────────────────────────────────

QUEUE_KEY        = "generation_queue"      # Redis list: LPUSH to enqueue, BRPOP to dequeue (FIFO)
TASK_KEY_PREFIX  = "task:"                 # task:{id} → JSON status blob
TASK_TTL_SECONDS = 3600                    # Results expire after 1 hour
WORKER_MIN_DELAY = float(os.getenv("WORKER_MIN_DELAY", "4"))  # Minimum seconds between LLM calls

# ── In-memory preview store ────────────────────────────────────────────────────

preview_store: dict[str, GeneratedProblem] = {}

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)

# ── Scheduler ─────────────────────────────────────────────────────────────────

scheduler = AsyncIOScheduler()

# ── Redis client (module-level, initialised in lifespan) ──────────────────────

redis: aioredis.Redis = None  # type: ignore[assignment]


def _get_redis() -> aioredis.Redis:
    """Return the live Redis client; raises if not yet initialised."""
    if redis is None:
        raise RuntimeError("Redis client not initialised. Is the app running?")
    return redis


# ── Task helpers ──────────────────────────────────────────────────────────────

async def _set_task(task_id: str, status: str, **extra) -> None:
    """Write/update a task status blob in Redis with a TTL."""
    payload = {"task_id": task_id, "status": status, **extra}
    await _get_redis().setex(
        f"{TASK_KEY_PREFIX}{task_id}",
        TASK_TTL_SECONDS,
        json.dumps(payload, default=str),
    )


async def _get_task(task_id: str) -> Optional[dict]:
    """Read a task status blob from Redis; returns None if absent/expired."""
    raw = await _get_redis().get(f"{TASK_KEY_PREFIX}{task_id}")
    return json.loads(raw) if raw else None


async def enqueue_generation(request: GenerateRequest, publish: bool, auth_token: Optional[str] = None) -> str:
    """
    Push a generation job onto the FIFO Redis queue and return its task_id.

    The payload stored in the queue contains everything the worker needs so
    no in-process state is required between enqueue and processing.
    """
    task_id = str(uuid.uuid4())
    job_payload = {
        "task_id":    task_id,
        "request":    request.model_dump(),
        "publish":    publish,
        "auth_token": auth_token,
    }
    await _get_redis().lpush(QUEUE_KEY, json.dumps(job_payload))
    await _set_task(task_id, "queued", problems_generated=0, problems=[], message="Queued, waiting for worker.")
    logger.info(f"Enqueued task {task_id} ({request.count}×{request.difficulty} {request.topic})")
    return task_id


# ── Core pipeline runner ───────────────────────────────────────────────────────

async def run_pipeline(request: GenerateRequest, publish: bool = True, auth_token: Optional[str] = None) -> list:
    """Run the LangGraph pipeline and optionally publish to Spring Boot."""
    problems = []
    loop = asyncio.get_event_loop()

    for i in range(request.count):
        logger.info(f"Generating problem {i+1}/{request.count} (task worker)…")

        initial_state: ProblemState = {
            "request":       request,
            "draft_problem": None,
            "validation":    None,
            "final_problem": None,
            "retry_count":   0,
            "error":         None,
        }

        # LangGraph is synchronous — run in thread pool to avoid blocking the event loop.
        final_state = await loop.run_in_executor(
            None,
            lambda s=initial_state: problem_pipeline.invoke(s),
        )

        problem = final_state.get("final_problem")
        if not problem:
            logger.error(f"Pipeline returned no problem. Error: {final_state.get('error')}")
            continue

        logger.info(
            f"Pipeline complete: '{problem.title}' "
            f"score={final_state.get('validation', {}).quality_score if final_state.get('validation') else 'N/A'}"
        )

        if publish:
            await publish_problem(problem, auth_token=auth_token)

        problems.append(problem)

        if i < request.count - 1:
            # Rate-limit buffer between problems within the same job.
            await asyncio.sleep(3)

    return problems


# ── Worker loop ────────────────────────────────────────────────────────────────

async def generation_worker() -> None:
    """
    Single-consumer FIFO worker.

    Uses BRPOP with a timeout so the loop wakes up promptly when a job
    arrives, but also allows a graceful shutdown check every few seconds.

    Rate-limiting: after processing each job we sleep for at least
    WORKER_MIN_DELAY seconds before accepting the next one.  This prevents
    multiple concurrent admin requests from hammering the LLM API.
    """
    logger.info("Generation worker started.")
    r = _get_redis()

    while True:
        # BRPOP blocks up to 5 s then returns None — lets the loop stay async-friendly.
        item = await r.brpop(QUEUE_KEY, timeout=5)
        if item is None:
            continue  # nothing in queue, loop again

        _, raw = item
        job: dict = json.loads(raw)
        task_id    = job["task_id"]
        auth_token = job.get("auth_token")
        publish    = job.get("publish", True)
        request    = GenerateRequest(**job["request"])

        logger.info(f"Worker picked up task {task_id}")
        await _set_task(task_id, "processing", message="Worker is running the pipeline.")

        try:
            problems = await run_pipeline(request, publish=publish, auth_token=auth_token)
            preview_ids = []
            if not publish:
                for problem in problems:
                    pid = str(uuid.uuid4())
                    preview_store[pid] = problem
                    preview_ids.append(pid)

            await _set_task(
                task_id,
                "done",
                problems_generated=len(problems),
                preview_ids=preview_ids,
                problems=[p.model_dump() for p in problems],
                message=f"Generated {len(problems)}/{request.count} problems successfully.",
            )
            logger.info(f"Task {task_id} done ({len(problems)} problems). Saved previews: {preview_ids}")
        except Exception as exc:
            logger.exception(f"Task {task_id} failed: {exc}")
            await _set_task(task_id, "failed", error=str(exc), message="Pipeline error — see agent logs.")

        # Enforce minimum inter-job delay to respect LLM rate limits.
        await asyncio.sleep(WORKER_MIN_DELAY)


# ── Daily scheduler job ────────────────────────────────────────────────────────

async def daily_problem_generation() -> None:
    """Runs every day at 06:00 — enqueues 3 problems across difficulties."""
    logger.info("Daily problem generation: enqueueing…")
    import random
    topics = ["arrays", "dynamic programming", "graphs", "trees", "binary search"]
    for difficulty in [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]:
        req = GenerateRequest(topic=random.choice(topics), difficulty=difficulty, count=1)
        await enqueue_generation(req, publish=True)
        await asyncio.sleep(1)  # small stagger so the queue has sensible ordering
    logger.info("Daily generation: all jobs enqueued.")


# ── App lifecycle ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global redis

    # Connect to Redis.
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        raise ValueError("REDIS_URL environment variable is not defined. Please set it in your environment or .env file.")
    redis = aioredis.from_url(redis_url, decode_responses=True)
    await redis.ping()
    logger.info(f"Connected to Redis at {redis_url}")

    # Start background worker.
    worker_task = asyncio.create_task(generation_worker())

    # Start daily scheduler.
    scheduler.add_job(
        daily_problem_generation,
        CronTrigger(hour=6, minute=0),
        id="daily_generate",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("Agent service started. Scheduler + worker running.")

    yield  # ── app is live ──

    # Graceful shutdown.
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass

    scheduler.shutdown()
    await redis.aclose()
    logger.info("Agent service shut down cleanly.")


# ── FastAPI app ────────────────────────────────────────────────────────────────

app = FastAPI(
    title="DSA Platform — Agent Service",
    description="Problem Generator Agent pipeline using LangGraph + Gemini (Redis-queued)",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Generation endpoints ───────────────────────────────────────────────────────

@app.post("/generate", status_code=202)
async def generate_problem(
    request: GenerateRequest,
    token: str = Depends(verify_admin_token),
):
    """
    Enqueue a generation job and return immediately with a task_id.

    Poll GET /generate/status/{task_id} to check progress.
    Previously this endpoint blocked until the LLM finished; now it returns
    in < 50 ms and the worker processes the job asynchronously.
    """
    task_id = await enqueue_generation(request, publish=True, auth_token=token)
    return {
        "task_id": task_id,
        "status":  "queued",
        "message": f"Generation job queued. Poll /generate/status/{task_id} for results.",
    }


@app.get("/generate/status/{task_id}")
async def get_generation_status(task_id: str, token: str = Depends(verify_admin_token)):
    """
    Poll the status of an enqueued generation job.

    Possible values for `status`:
      - queued      — waiting in queue
      - processing  — worker is running the LLM pipeline
      - done        — finished; `problems` array is populated
      - failed      — pipeline error; `error` field has detail
    """
    task = await _get_task(task_id)
    if task is None:
        raise HTTPException(
            status_code=404,
            detail=f"Task '{task_id}' not found. It may have expired (TTL={TASK_TTL_SECONDS}s) or never existed.",
        )
    return task


@app.get("/generate/queue/depth")
async def get_queue_depth(token: str = Depends(verify_admin_token)):
    """Return the number of jobs currently waiting in the Redis queue."""
    depth = await _get_redis().llen(QUEUE_KEY)
    return {"queue_depth": depth, "queue_key": QUEUE_KEY}


@app.post("/generate/preview", status_code=202)
async def preview_problem(
    request: GenerateRequest,
    token: str = Depends(verify_admin_token),
):
    """
    Enqueue a generation job that does NOT publish to Spring Boot.

    Returns a task_id. Once status is 'done', problems are stored in
    the preview store; list them via GET /generate/preview/list.

    NOTE: The worker calls a thin wrapper that stores results into
    preview_store instead of publishing.  preview_ids are written into
    the task result blob so the caller knows which IDs to save/discard.
    """
    task_id = await enqueue_generation(request, publish=False, auth_token=token)
    # Mark the task as a preview job so the worker stores results appropriately.
    raw = await _get_redis().get(f"{TASK_KEY_PREFIX}{task_id}")
    if raw:
        blob = json.loads(raw)
        blob["is_preview"] = True
        await _get_redis().setex(
            f"{TASK_KEY_PREFIX}{task_id}",
            TASK_TTL_SECONDS,
            json.dumps(blob),
        )
    return {
        "task_id": task_id,
        "status":  "queued",
        "message": f"Preview job queued. Poll /generate/status/{task_id}, then list via /generate/preview/list.",
    }


@app.get("/generate/preview/list")
async def list_previews(token: str = Depends(verify_admin_token)):
    """List all problems currently in the preview store waiting for admin action."""
    return {
        "count": len(preview_store),
        "previews": [
            {
                "preview_id":        pid,
                "title":             p.title,
                "description":       p.description,
                "difficulty":        p.difficulty.value,
                "constraints":       p.constraints,
                "input_format":      p.input_format,
                "output_format":     p.output_format,
                "sample_input":      p.sample_input,
                "sample_output":     p.sample_output,
                "time_complexity":   p.time_complexity,
                "space_complexity":  p.space_complexity,
                "reference_solution": p.reference_solution,
                "hints":       json.loads(p.hints) if isinstance(p.hints, str) else (p.hints or []),
                "topic_tags":  json.loads(p.topic_tags) if isinstance(p.topic_tags, str) else (p.topic_tags or []),
                "test_cases":  [
                    {"input": tc.input, "expected_output": tc.expected_output, "hidden": tc.hidden}
                    for tc in p.test_cases
                ] if hasattr(p, "test_cases") else [],
            }
            for pid, p in preview_store.items()
        ],
    }


@app.post("/generate/save/{preview_id}")
async def save_preview(
    preview_id: str,
    updated_problem: Optional[GeneratedProblem] = None,
    token: str = Depends(verify_admin_token),
):
    """Save a specific previewed problem to Spring Boot / PostgreSQL."""
    problem = updated_problem or preview_store.get(preview_id)
    if not problem:
        raise HTTPException(
            status_code=404,
            detail=f"Preview ID '{preview_id}' not found. It may have already been saved or expired.",
        )
    success = await publish_problem(problem, auth_token=token)
    if success:
        preview_store.pop(preview_id, None)
        return {"success": True, "message": f"Problem '{problem.title}' saved to database."}
    raise HTTPException(status_code=502, detail="Failed to save to Spring Boot. Check Spring Boot logs.")


@app.delete("/generate/preview/{preview_id}")
async def discard_preview(preview_id: str, token: str = Depends(verify_admin_token)):
    """Discard a previewed problem without saving it."""
    if preview_id not in preview_store:
        raise HTTPException(status_code=404, detail="Preview ID not found.")
    title = preview_store.pop(preview_id).title
    return {"success": True, "message": f"Problem '{title}' discarded."}


@app.post("/generate/bulk", status_code=202)
async def bulk_generate(
    request: GenerateRequest,
    token: str = Depends(verify_admin_token),
):
    """
    Enqueue a bulk generation job (up to 10 problems).

    Returns immediately with a task_id.  Previously used BackgroundTasks
    which could spawn multiple threads racing for the same API quota;
    now all requests share the single worker queue.
    """
    if request.count > 10:
        raise HTTPException(status_code=400, detail="Max 10 problems per bulk request.")

    task_id = await enqueue_generation(request, publish=True, auth_token=token)
    return {
        "task_id": task_id,
        "status":  "queued",
        "message": f"Bulk job ({request.count} problems) queued. Poll /generate/status/{task_id}.",
    }


# ── Authentication Management ──────────────────────────────────────────────────

@app.get("/admin/auth/list")
async def list_admins():
    from core.auth import authenticator
    admins = authenticator.list_admins()
    return {"configured_admins": admins, "count": len(admins), "primary_admin": authenticator.primary_admin}


@app.post("/admin/auth/test")
async def test_auth(admin_email: str = None):
    from core.auth import authenticator
    try:
        token = await authenticator.get_token(admin_email)
        return {
            "success":       True,
            "admin_email":   admin_email or authenticator.primary_admin,
            "token_preview": token[:50] + "…",
            "message":       "✓ Authentication successful",
        }
    except Exception as e:
        return {
            "success":     False,
            "admin_email": admin_email or authenticator.primary_admin,
            "error":       str(e),
            "message":     "✗ Authentication failed. Check credentials in .env",
        }


@app.post("/admin/auth/refresh")
async def refresh_tokens(admin_email: str = None):
    from core.auth import authenticator, token_cache
    if admin_email:
        token_cache.clear(admin_email)
        try:
            await authenticator.get_token(admin_email)
            return {"success": True, "admin_email": admin_email, "message": f"✓ Token refreshed for {admin_email}"}
        except Exception as e:
            return {"success": False, "admin_email": admin_email, "error": str(e), "message": f"✗ Refresh failed: {e}"}
    token_cache.clear()
    tokens = await authenticator.get_tokens_for_all_admins()
    return {
        "success":         len(tokens) > 0,
        "refreshed_count": len(tokens),
        "admins":          list(tokens.keys()),
        "message":         f"✓ Refreshed tokens for {len(tokens)} admin(s)",
    }


# ── Health ─────────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    queue_depth = await _get_redis().llen(QUEUE_KEY)
    return {
        "status":        "ok",
        "scheduler":     scheduler.running,
        "queue_depth":   queue_depth,
        "worker":        "running",
        "next_daily_run": str(scheduler.get_job("daily_generate").next_run_time)
            if scheduler.get_job("daily_generate") else None,
    }


# ── Optimization Monitoring ────────────────────────────────────────────────────

@app.get("/admin/optimize/llm-config")
async def get_llm_config():
    from core.llm import PRIMARY_LLM
    from core.rate_limiter import get_all_limiter_stats
    return {
        "primary_llm":     PRIMARY_LLM,
        "available_llms":  ["groq", "gemini", "together", "ollama"],
        "rate_limiters":   get_all_limiter_stats(),
        "note": "To change PRIMARY_LLM, set env var PRIMARY_LLM=groq|gemini|together|ollama",
    }


@app.get("/admin/optimize/cache-stats")
async def get_cache_stats():
    from core.cache import get_cache_info
    return get_cache_info()


@app.post("/admin/optimize/cache/clear")
async def clear_cache(prefix: str = None):
    from core.cache import clear_cache as _clear
    _clear(prefix)
    return {"success": True, "cleared_prefix": prefix or "all", "message": "✓ Cache cleared"}


@app.get("/admin/optimize/stats")
async def get_optimization_stats():
    from core.cache import get_cache_info
    from core.rate_limiter import get_all_limiter_stats
    from core.llm import PRIMARY_LLM
    return {
        "configuration": {
            "primary_llm":           PRIMARY_LLM,
            "api_calls_per_problem": 4,
            "note": "Reduced from 5 to 4 by removing difficulty_analyzer",
        },
        "cache":         get_cache_info(),
        "rate_limiters": get_all_limiter_stats(),
    }


# ── Resume & Job Matchmaking ───────────────────────────────────────────────────

class MatchRequest(BaseModel):
    skills: list[str]
    role: str = "Software Engineer"


@app.post("/agent/resume/extract", response_model=ExtractedSkills)
async def extract_resume(file: UploadFile = File(...)):
    try:
        content = await file.read()
        text = extract_text_from_file(content, file.filename)
        if not text:
            raise HTTPException(status_code=400, detail="Could not extract text from file.")
        return await extract_skills_from_text(text)
    except Exception as e:
        logger.error(f"Resume extraction failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/agent/jobs/match", response_model=JobMatchResponse)
async def match_jobs(request: MatchRequest):
    try:
        jobs    = await retrieve_all_jobs(request.skills, request.role)
        matches = await match_jobs_with_llm(request.skills, jobs)
        return JobMatchResponse(success=True, skills=request.skills, matches=matches,
                                message=f"Successfully matched {len(matches)} jobs")
    except Exception as e:
        logger.error(f"Job matchmaking failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/api/interview/ws")
async def websocket_route(websocket: WebSocket):
    await interview_websocket_endpoint(websocket)


@app.get("/")
async def root():
    return {"service": "DSA Platform Agent Service", "docs": "/docs"}


# ── Run ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("AGENT_PORT", 8001)), reload=False)