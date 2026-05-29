import json
import logging
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from schemas.problem import GeneratedProblem, Difficulty
from core.llm import get_llm_with_fallback
from core.state import ProblemState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert competitive programming problem setter with 10+ years of experience 
creating problems for platforms like LeetCode, Codeforces, and company technical interviews.

Your problems are:
- Unambiguous and clearly stated
- Solvable in 20-45 minutes by a competent engineer
- Based on real algorithmic concepts (not tricks or gotchas)
- Well-constrained so there's exactly one correct approach complexity-wise

You MUST respond with ONLY valid JSON matching the schema provided. No markdown, no explanation."""


def build_user_prompt(state: ProblemState) -> str:
    req = state["request"]
    parts = ["Generate a DSA coding problem with the following requirements:"]

    if req.topic:
        parts.append(f"- Topic: {req.topic}")
    else:
        parts.append("- Topic: any common DSA topic (arrays, graphs, dp, trees, strings, etc.)")

    if req.difficulty:
        parts.append(f"- Difficulty: {req.difficulty.value}")
    else:
        parts.append("- Difficulty: choose appropriately for the topic")

    if req.company_style:
        parts.append(f"- Style: Similar to {req.company_style} interview questions")

    parts.append("""
Return ONLY a JSON object with these exact keys:
{
  "title": "string",
  "description": "string (full problem statement in markdown)",
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "constraints": "string",
  "input_format": "string",
  "output_format": "string",
  "sample_input": "string",
  "sample_output": "string",
  "test_cases": [
    {"input": "string", "expected_output": "string", "hidden": false},
    ... (include 6-10 test cases, last 3-4 should be hidden: true)
  ],
  "hints": ["vague hint", "more specific hint", "almost-solution hint"],
  "topic_tags": ["tag1", "tag2"],
  "time_complexity": "O(?)",
  "space_complexity": "O(?)"
}
""")
    return "\n".join(parts)


def generator_agent(state: ProblemState) -> ProblemState:
    """Agent 1: Generates the initial draft of a problem."""
    logger.info("Generator agent running...")
    llm = get_llm_with_fallback()

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=build_user_prompt(state))
    ]

    try:
        response = llm.invoke(messages)
        raw = response.content.strip()

        # Strip markdown fences if LLM added them despite instructions
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        data = json.loads(raw)
        problem = GeneratedProblem(**data)

        logger.info(f"Generator produced: '{problem.title}' ({problem.difficulty})")
        return {**state, "draft_problem": problem, "error": None}

    except (json.JSONDecodeError, Exception) as e:
        logger.error(f"Generator agent failed: {e}")
        return {**state, "error": f"Generator failed: {str(e)}"}