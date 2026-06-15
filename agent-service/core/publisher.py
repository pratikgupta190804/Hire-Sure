import os
import logging
import httpx
from schemas.problem import GeneratedProblem
from core.auth import authenticator

logger = logging.getLogger(__name__)

SPRING_URL = os.getenv("SPRING_BOOT_URL", "http://localhost:8080")


def build_spring_payload(problem: GeneratedProblem) -> dict:
    """Converts GeneratedProblem to Spring Boot's ProblemRequest format."""
    import json
    return {
        "title": problem.title,
        "description": problem.description,
        "difficulty": problem.difficulty.value,
        "constraints": problem.constraints,
        "inputFormat": problem.input_format,
        "outputFormat": problem.output_format,
        "sampleInput": problem.sample_input,
        "sampleOutput": problem.sample_output,
        "timeComplexity": problem.time_complexity,
        "spaceComplexity": problem.space_complexity,
        "hints": json.dumps(problem.hints),
        "topicTags": json.dumps(problem.topic_tags),
        "testCases": [
            {
                "input": tc.input,
                "expectedOutput": tc.expected_output,
                "hidden": tc.hidden
            }
            for tc in problem.test_cases
        ],
    }


async def publish_problem(problem: GeneratedProblem, auth_token: str = None) -> bool:
    """
    POSTs a generated problem to Spring Boot.
    Can use a forwarded client JWT token or authenticate automatically
    using the configured service admin credentials in .env.
    
    Args:
        problem: GeneratedProblem to publish
        auth_token: Optional client JWT token to forward.
    
    Returns:
        True on success, False on failure.
    """
    token = auth_token
    if not token:
        try:
            # Fall back to configured service account token (e.g., daily scheduler)
            token = await authenticator.get_token()
        except Exception as e:
            logger.error(f"Failed to authenticate with Spring Boot: {e}")
            return False
    
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    }
    payload = build_spring_payload(problem)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{SPRING_URL}/api/problems",
                json=payload,
                headers=headers
            )
            response.raise_for_status()
            saved = response.json()
            logger.info(f"Published problem '{problem.title}' → Spring Boot ID: {saved.get('id')}")
            return True

    except httpx.HTTPStatusError as e:
        logger.error(f"Spring Boot rejected problem: {e.response.status_code} — {e.response.text}")
        return False
    except Exception as e:
        logger.error(f"Failed to publish problem to Spring Boot: {e}")
        return False