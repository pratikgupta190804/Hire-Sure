import json
import logging
from langchain_core.messages import HumanMessage, SystemMessage
from schemas.problem import Difficulty
from core.llm import get_llm_with_fallback
from core.state import ProblemState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a difficulty calibration expert for coding interview problems.
You have deep knowledge of LeetCode, Codeforces, and FAANG interview standards.
Respond ONLY with valid JSON."""


def difficulty_analyzer_agent(state: ProblemState) -> ProblemState:
    """
    Agent 4: Independently verifies the difficulty label is accurate.
    Corrects it if the generator mislabeled.
    """
    logger.info("Difficulty analyzer agent running...")

    problem = state.get("draft_problem")
    if not problem:
        return {**state, "error": "No problem to analyze difficulty for"}

    llm = get_llm_with_fallback()

    prompt = f"""Analyze the difficulty of this coding problem:

Title: {problem.title}
Description: {problem.description}
Constraints: {problem.constraints}
Expected time complexity: {problem.time_complexity}
Topic tags: {problem.topic_tags}
Current difficulty label: {problem.difficulty}

Difficulty criteria:
- EASY: Single data structure, straightforward logic, O(n) or O(n log n). Junior devs should solve in 15 min.
- MEDIUM: Requires combining 2 concepts, non-obvious approach. 20-35 min for mid-level dev.
- HARD: Complex algorithm, requires insight. Even senior devs may struggle. 35-45 min.

Return ONLY this JSON:
{{
  "confirmed_difficulty": "EASY" | "MEDIUM" | "HARD",
  "reasoning": "one sentence explaining why",
  "label_was_correct": true/false
}}"""

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
        confirmed = data.get("confirmed_difficulty", problem.difficulty)
        was_correct = data.get("label_was_correct", True)

        if not was_correct:
            logger.info(f"Difficulty corrected: {problem.difficulty} → {confirmed}. Reason: {data.get('reasoning')}")
            updated = problem.model_copy(update={"difficulty": Difficulty(confirmed)})
            return {**state, "draft_problem": updated, "difficulty_confirmed": True}
        else:
            logger.info(f"Difficulty confirmed: {confirmed}")
            return {**state, "difficulty_confirmed": True}

    except Exception as e:
        logger.error(f"Difficulty analyzer failed: {e}")
        return {**state, "difficulty_confirmed": True}  # non-fatal