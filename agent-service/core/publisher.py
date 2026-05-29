import os
import logging
import httpx
from schemas.problem import GeneratedProblem

logger = logging.getLogger(__name__)

SPRING_URL = os.getenv("SPRING_BOOT_URL", "http://localhost:8080")
TOKEN = os.getenv("SPRING_BOOT_TOKEN", "")


def build_spring_payload(problem: GeneratedProblem) -> dict:
    """Converts GeneratedProblem to Spring Boot's ProblemRequest format."""
    return {
        "title": problem.title,
        "description": problem.description,
        "difficulty": problem.difficulty.value,
        "constraints": problem.constraints,
        "inputFormat": problem.input_format,
        "outputFormat": problem.output_format,
        "sampleInput": problem.sample_input,
        "sampleOutput": problem.sample_output,
        "testCases": [
            {
                "input": tc.input,
                "expectedOutput": tc.expected_output,
                "hidden": tc.hidden
            }
            for tc in problem.test_cases
        ],
        # hints, topic_tags, complexities stored in description for now
        # (extend Spring Boot schema later to support these fields)
    }


async def publish_problem(problem: GeneratedProblem) -> bool:
    """
    POSTs a generated problem to Spring Boot.
    Returns True on success, False on failure.
    """
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {TOKEN}"
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