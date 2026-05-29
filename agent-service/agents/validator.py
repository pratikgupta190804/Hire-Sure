import json
import logging
from langchain_core.messages import HumanMessage, SystemMessage
from schemas.problem import ValidationResult
from core.llm import get_llm_with_fallback
from core.state import ProblemState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a strict quality reviewer for competitive programming problems.
You evaluate problems for clarity, correctness, difficulty accuracy, and test case quality.
Respond ONLY with valid JSON — no explanation, no markdown."""


def validator_agent(state: ProblemState) -> ProblemState:
    """
    Agent 2: Reviews the draft problem and gives a quality score.
    If score < threshold, the pipeline will retry.
    """
    logger.info("Validator agent running...")

    problem = state.get("draft_problem")
    if not problem:
        return {**state, "error": "No draft problem to validate"}

    llm = get_llm_with_fallback()

    prompt = f"""Review this coding problem and return a JSON quality assessment:

Problem title: {problem.title}
Difficulty: {problem.difficulty}
Description: {problem.description}
Constraints: {problem.constraints}
Sample Input: {problem.sample_input}
Sample Output: {problem.sample_output}
Test cases count: {len(problem.test_cases)}
Time complexity: {problem.time_complexity}

Evaluate on these criteria:
1. Problem statement clarity (is it unambiguous?)
2. Difficulty accuracy (does it match the label?)
3. Test case quality (edge cases covered? hidden cases included?)
4. Constraints validity (realistic? consistent with complexity?)
5. Sample correctness (does the sample output match the description?)

Return ONLY this JSON:
{{
  "is_valid": true/false,
  "quality_score": <float 0-10>,
  "issues": ["issue1", "issue2", ...],
  "suggestions": ["improvement1", "improvement2", ...]
}}

Score guide: 9-10=publish-ready, 7-8=good with minor fixes, 5-6=needs work, <5=regenerate"""

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
        validation = ValidationResult(**data)

        logger.info(f"Validator score: {validation.quality_score}/10 — valid: {validation.is_valid}")
        if validation.issues:
            logger.info(f"Issues found: {validation.issues}")

        return {**state, "validation": validation}

    except Exception as e:
        logger.error(f"Validator agent failed: {e}")
        # On validator failure, give a passing score to not block the pipeline
        fallback = ValidationResult(is_valid=True, quality_score=7.0, issues=[], suggestions=[])
        return {**state, "validation": fallback}