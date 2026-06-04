import os
import logging
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from schemas.problem import GenerateRequest, GenerateResponse, GeneratedProblem, Difficulty
from core.pipeline import problem_pipeline
from core.publisher import publish_problem
from core.state import ProblemState

# In-memory store for previewed problems waiting for admin approval
# key: preview_id, value: GeneratedProblem
preview_store: dict[str, GeneratedProblem] = {}

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


# ── Daily scheduler ────────────────────────────────────────────────────────────

async def daily_problem_generation():
    """Runs every day at 6 AM — generates 3 problems across difficulties."""
    logger.info("Daily problem generation starting...")
    topics = ["arrays", "dynamic programming", "graphs", "trees", "binary search"]
    difficulties = [Difficulty.EASY, Difficulty.MEDIUM, Difficulty.HARD]

    import random
    for difficulty in difficulties:
        req = GenerateRequest(
            topic=random.choice(topics),
            difficulty=difficulty,
            count=1
        )
        await run_pipeline(req, publish=True)
        await asyncio.sleep(5)  # small delay between calls to respect rate limits

    logger.info("Daily generation complete.")


# ── App lifecycle ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start scheduler on startup
    scheduler.add_job(
        daily_problem_generation,
        CronTrigger(hour=6, minute=0),
        id="daily_generate",
        replace_existing=True
    )
    scheduler.start()
    logger.info("Agent service started. Scheduler running.")
    yield
    scheduler.shutdown()
    logger.info("Agent service shutting down.")


app = FastAPI(
    title="DSA Platform — Agent Service",
    description="Problem Generator Agent pipeline using LangGraph + Gemini",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080", "http://localhost:3000", "http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Core pipeline runner ───────────────────────────────────────────────────────

async def run_pipeline(request: GenerateRequest, publish: bool = True) -> list:
    """Runs the LangGraph pipeline and optionally publishes to Spring Boot."""
    problems = []

    for i in range(request.count):
        logger.info(f"Generating problem {i+1}/{request.count}...")

        initial_state: ProblemState = {
            "request": request,
            "draft_problem": None,
            "validation": None,
            "refined_problem": None,
            "test_cases_added": False,
            "difficulty_confirmed": False,
            "hints_added": False,
            "final_problem": None,
            "retry_count": 0,
            "error": None,
        }

        # Run pipeline synchronously in thread pool (LangGraph is sync)
        loop = asyncio.get_event_loop()
        final_state = await loop.run_in_executor(
            None,
            lambda s=initial_state: problem_pipeline.invoke(s)
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
            await publish_problem(problem)

        problems.append(problem)

        if i < request.count - 1:
            await asyncio.sleep(3)  # rate limit buffer between problems

    return problems


# ── API Routes ─────────────────────────────────────────────────────────────────

@app.post("/generate", response_model=GenerateResponse)
async def generate_problem(request: GenerateRequest):
    """
    Generate one or more problems and publish to Spring Boot.

    Called by Spring Boot admin panel or directly via API.
    """
    try:
        problems = await run_pipeline(request, publish=True)

        return GenerateResponse(
            success=len(problems) > 0,
            problems_generated=len(problems),
            problems=problems,
            message=f"Generated {len(problems)}/{request.count} problems successfully"
        )
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/preview", response_model=GenerateResponse)
async def preview_problem(request: GenerateRequest):
    """
    Generate problems WITHOUT publishing to Spring Boot.
    Each problem gets a preview_id you can use to save it later via /generate/save/{preview_id}.
    The preview is held in memory for 1 hour.
    """
    try:
        import uuid
        problems = await run_pipeline(request, publish=False)

        # Store each problem with a unique ID so admin can selectively save
        for problem in problems:
            preview_id = str(uuid.uuid4())
            preview_store[preview_id] = problem
            # Attach preview_id into the model so the response includes it
            object.__setattr__(problem, '__preview_id__', preview_id)

        # Return with preview_ids embedded in message for now
        ids = [k for k, v in preview_store.items() if v in problems]
        return GenerateResponse(
            success=len(problems) > 0,
            problems_generated=len(problems),
            problems=problems,
            message=f"Preview ready. Save with: POST /generate/save/<preview_id>. IDs: {ids}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/generate/preview/list")
async def list_previews():
    """List all problems currently in the preview store waiting for admin action."""
    import json
    return {
        "count": len(preview_store),
        "previews": [
            {
                "preview_id": pid,
                "title": p.title,
                "description": p.description,
                "difficulty": p.difficulty.value,
                "constraints": p.constraints,
                "input_format": p.input_format,
                "output_format": p.output_format,
                "sample_input": p.sample_input,
                "sample_output": p.sample_output,
                "time_complexity": p.time_complexity,
                "space_complexity": p.space_complexity,
                "hints": json.loads(p.hints) if isinstance(p.hints, str) else p.hints if p.hints else [],
                "topic_tags": json.loads(p.topic_tags) if isinstance(p.topic_tags, str) else p.topic_tags if p.topic_tags else [],
                "test_cases": [
                    {"input": tc.input, "expected_output": tc.expected_output, "hidden": tc.hidden}
                    for tc in p.test_cases
                ] if hasattr(p, 'test_cases') else []
            }
            for pid, p in preview_store.items()
        ]
    }


@app.post("/generate/save/{preview_id}")
async def save_preview(preview_id: str):
    """
    Save a specific previewed problem to Spring Boot / PostgreSQL.
    Call this after reviewing the output of /generate/preview.
    """
    problem = preview_store.get(preview_id)
    if not problem:
        raise HTTPException(
            status_code=404,
            detail=f"Preview ID '{preview_id}' not found. It may have already been saved or expired."
        )

    success = await publish_problem(problem)
    if success:
        del preview_store[preview_id]  # remove from store after saving
        return {"success": True, "message": f"Problem '{problem.title}' saved to database."}
    else:
        raise HTTPException(status_code=502, detail="Failed to save to Spring Boot. Check Spring Boot logs.")


@app.delete("/generate/preview/{preview_id}")
async def discard_preview(preview_id: str):
    """Discard a previewed problem without saving it."""
    if preview_id not in preview_store:
        raise HTTPException(status_code=404, detail="Preview ID not found.")
    title = preview_store[preview_id].title
    del preview_store[preview_id]
    return {"success": True, "message": f"Problem '{title}' discarded."}


@app.post("/generate/bulk", response_model=GenerateResponse)
async def bulk_generate(request: GenerateRequest, background_tasks: BackgroundTasks):
    """
    Generate many problems in the background. Returns immediately.
    Check logs for progress.
    """
    if request.count > 10:
        raise HTTPException(status_code=400, detail="Max 10 problems per request")

    background_tasks.add_task(run_pipeline, request, True)

    return GenerateResponse(
        success=True,
        problems_generated=0,
        problems=[],
        message=f"Bulk generation of {request.count} problems started in background"
    )


# ── Authentication Management ──────────────────────────────────────────────────

@app.get("/admin/auth/list")
async def list_admins():
    """
    List all configured admin accounts.
    Useful for multi-admin setups to see which admins are available.
    """
    from core.auth import authenticator
    admins = authenticator.list_admins()
    return {
        "configured_admins": admins,
        "count": len(admins),
        "primary_admin": authenticator.primary_admin
    }


@app.post("/admin/auth/test")
async def test_auth(admin_email: str = None):
    """
    Test authentication with a specific admin account.
    Tries to fetch a token to verify credentials are valid.
    
    Query params:
        admin_email: Admin email to test. If not provided, tests primary admin.
    """
    from core.auth import authenticator
    try:
        token = await authenticator.get_token(admin_email)
        # Return first 50 chars of token for verification
        return {
            "success": True,
            "admin_email": admin_email or authenticator.primary_admin,
            "token_preview": token[:50] + "...",
            "message": "✓ Authentication successful"
        }
    except Exception as e:
        return {
            "success": False,
            "admin_email": admin_email or authenticator.primary_admin,
            "error": str(e),
            "message": "✗ Authentication failed. Check credentials in .env"
        }


@app.post("/admin/auth/refresh")
async def refresh_tokens(admin_email: str = None):
    """
    Force refresh tokens for admin(s).
    Clears cache and fetches new tokens from Spring Boot.
    
    Query params:
        admin_email: Specific admin to refresh. If not provided, refreshes all.
    """
    from core.auth import authenticator, token_cache
    
    if admin_email:
        token_cache.clear(admin_email)
        try:
            token = await authenticator.get_token(admin_email)
            return {
                "success": True,
                "admin_email": admin_email,
                "message": f"✓ Token refreshed for {admin_email}"
            }
        except Exception as e:
            return {
                "success": False,
                "admin_email": admin_email,
                "error": str(e),
                "message": f"✗ Failed to refresh token: {str(e)}"
            }
    else:
        # Refresh all admins
        token_cache.clear()
        tokens = await authenticator.get_tokens_for_all_admins()
        return {
            "success": len(tokens) > 0,
            "refreshed_count": len(tokens),
            "admins": list(tokens.keys()),
            "message": f"✓ Refreshed tokens for {len(tokens)} admin(s)"
        }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "scheduler": scheduler.running,
        "next_daily_run": str(scheduler.get_job("daily_generate").next_run_time)
        if scheduler.get_job("daily_generate") else None
    }


# ── Optimization Monitoring (Solutions 2-4) ────────────────────────────────────

@app.get("/admin/optimize/llm-config")
async def get_llm_config():
    """Get current LLM configuration and rate limit info."""
    from core.llm import PRIMARY_LLM
    from core.rate_limiter import get_all_limiter_stats
    
    return {
        "primary_llm": PRIMARY_LLM,
        "available_llms": ["groq", "gemini", "together", "ollama"],
        "rate_limiters": get_all_limiter_stats(),
        "note": "To change PRIMARY_LLM, set env var PRIMARY_LLM=groq|gemini|together|ollama"
    }


@app.get("/admin/optimize/cache-stats")
async def get_cache_stats():
    """Get LLM response cache statistics."""
    from core.cache import get_cache_info
    return get_cache_info()


@app.post("/admin/optimize/cache/clear")
async def clear_cache(prefix: str = None):
    """Clear LLM response cache."""
    from core.cache import clear_cache as clear_cache_fn
    clear_cache_fn(prefix)
    return {
        "success": True,
        "cleared_prefix": prefix or "all",
        "message": f"✓ Cache cleared"
    }


@app.get("/admin/optimize/stats")
async def get_optimization_stats():
    """Get comprehensive optimization statistics."""
    from core.cache import get_cache_info
    from core.rate_limiter import get_all_limiter_stats
    from core.llm import PRIMARY_LLM
    
    cache_info = get_cache_info()
    rate_limiters = get_all_limiter_stats()
    
    return {
        "configuration": {
            "primary_llm": PRIMARY_LLM,
            "api_calls_per_problem": 4,
            "note": "Reduced from 5 to 4 by removing difficulty_analyzer"
        },
        "cache": cache_info,
        "rate_limiters": rate_limiters
    }


@app.get("/")
async def root():
    return {"service": "DSA Platform Agent Service", "docs": "/docs"}


# ── Run ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("AGENT_PORT", 8001)), reload=True)