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

CRITICAL: input and expected_output MUST be strings (JSON-encoded if complex).
Examples:
  {{"input": "[1, 2, 3]", "expected_output": "6", "hidden": true}}
  {{"input": "[100000]", "expected_output": "100000", "hidden": true}}
  {{"input": "5\\n10", "expected_output": "15", "hidden": true}}

Return ONLY this JSON array (no markdown, no explanation):
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
            raw = raw.rstrip("`").strip()

        data = json.loads(raw)
        
        # Process test cases: ensure input/output are strings
        new_cases = []
        for tc in data:
            input_val = tc.get("input", "")
            output_val = tc.get("expected_output", "")
            
            # Convert to string if not already
            if not isinstance(input_val, str):
                input_val = json.dumps(input_val)
            if not isinstance(output_val, str):
                output_val = json.dumps(output_val)
            
            new_cases.append(TestCase(
                input=input_val,
                expected_output=output_val,
                hidden=tc.get("hidden", True)
            ))

        # Merge with existing test cases
        combined = problem.test_cases + new_cases
        updated_problem = problem.model_copy(update={"test_cases": combined})

        logger.info(f"Test case agent added {len(new_cases)} cases. Total: {len(combined)}")
        return {**state, "draft_problem": updated_problem, "test_cases_added": True}

    except Exception as e:
        logger.error(f"Test case agent failed: {e}")
        # Non-fatal — keep existing test cases
        return {**state, "test_cases_added": False}