import json
import logging
from langchain_core.messages import HumanMessage, SystemMessage
from schemas.problem import TestCase
from core.llm import get_llm_with_fallback
from core.state import ProblemState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert at creating comprehensive test cases for algorithmic problems.
You specialise in finding edge cases that trip up naive solutions.
Respond ONLY with valid JSON — no explanation, no markdown."""


def test_case_generator_agent(state: ProblemState) -> ProblemState:
    """
    Agent 3: Augments the problem with additional edge-case test cases.
    Focuses on cases the generator may have missed.
    """
    logger.info("Test case generator agent running...")

    problem = state.get("draft_problem")
    if not problem:
        return {**state, "error": "No problem to generate test cases for"}

    existing_cases = "\n".join([
        f"Input: {tc.input} → Output: {tc.expected_output}"
        for tc in problem.test_cases[:3]  # show first 3 as context
    ])

    llm = get_llm_with_fallback()

    prompt = f"""Problem: {problem.title}
Description: {problem.description}
Constraints: {problem.constraints}
Time complexity expected: {problem.time_complexity}

Existing test cases (first 3):
{existing_cases}

Generate 4 additional EDGE CASE test cases that stress-test:
- Minimum/maximum constraint values
- All same elements
- Single element / empty input
- Cases that break greedy approaches
- Large inputs near the constraint boundary

Return ONLY this JSON array:
[
  {{"input": "...", "expected_output": "...", "hidden": true}},
  {{"input": "...", "expected_output": "...", "hidden": true}},
  {{"input": "...", "expected_output": "...", "hidden": true}},
  {{"input": "...", "expected_output": "...", "hidden": true}}
]"""

    try:
        response = llm.invoke([
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=prompt)
        ])
        raw = response.content.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        data = json.loads(raw.strip())
        new_cases = [TestCase(**tc) for tc in data]

        # Merge with existing test cases
        combined = problem.test_cases + new_cases
        updated_problem = problem.model_copy(update={"test_cases": combined})

        logger.info(f"Test case agent added {len(new_cases)} cases. Total: {len(combined)}")
        return {**state, "draft_problem": updated_problem, "test_cases_added": True}

    except Exception as e:
        logger.error(f"Test case agent failed: {e}")
        # Non-fatal — keep existing test cases
        return {**state, "test_cases_added": False}