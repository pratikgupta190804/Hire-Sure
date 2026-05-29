import json
import logging
from langchain_core.messages import HumanMessage, SystemMessage
from core.llm import get_llm_with_fallback
from core.state import ProblemState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert coding mentor who writes hints that guide without spoiling.
A good hint nudges thinking without revealing the solution.
Respond ONLY with valid JSON."""


def hint_generator_agent(state: ProblemState) -> ProblemState:
    """
    Agent 5: Writes 3 progressive hints — from vague nudge to near-solution.
    Replaces any hints the generator wrote with higher quality ones.
    """
    logger.info("Hint generator agent running...")

    problem = state.get("draft_problem")
    if not problem:
        return {**state, "error": "No problem to generate hints for"}

    llm = get_llm_with_fallback()

    prompt = f"""Write 3 progressive hints for this problem:

Title: {problem.title}
Description: {problem.description}
Expected approach: {problem.time_complexity} time, {problem.space_complexity} space
Topic tags: {problem.topic_tags}

Hint 1 (vague): Point toward the general strategy without naming it. "Have you considered what structure would let you look something up in O(1)?"
Hint 2 (medium): Name the data structure or algorithmic concept. Don't show code.
Hint 3 (specific): Describe the key insight of the solution step by step. Still no code.

Return ONLY this JSON:
{{
  "hints": [
    "hint 1 text",
    "hint 2 text", 
    "hint 3 text"
  ]
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
        hints = data.get("hints", problem.hints)

        updated = problem.model_copy(update={"hints": hints})
        logger.info(f"Hint generator wrote {len(hints)} hints for '{problem.title}'")
        return {**state, "draft_problem": updated, "hints_added": True, "final_problem": updated}

    except Exception as e:
        logger.error(f"Hint generator failed: {e}")
        # Non-fatal — keep existing hints
        return {**state, "hints_added": False, "final_problem": problem}