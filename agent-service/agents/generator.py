from openpyxl import drawing
from openpyxl import drawing
from openpyxl.drawing import spreadsheet_drawing
import json
import logging
from langchain_core.messages import HumanMessage, SystemMessage
from schemas.problem import GeneratedProblem, Difficulty
from core.llm import get_llm_with_fallback
from core.state import ProblemState

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are an expert competitive programming problem setter with 10+ years of experience 
creating problems for platforms like LeetCode, Codeforces, and company technical interviews.

Your problems are:
- Unambiguous, interesting, original, and clearly stated.
- Difficulty-calibrated correctly (EASY, MEDIUM, or HARD).
- Solvable in 20-45 minutes by a competent engineer.
- Testable with a clear optimal complexity.

You MUST respond with ONLY valid JSON matching the schema provided. No markdown outside the JSON, no explanation."""


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
  "description": "string (full problem statement in markdown. Explain the problem, rules, examples, and what the user needs to write)",
  "difficulty": "EASY" | "MEDIUM" | "HARD",
  "constraints": "string (e.g. '1 <= n <= 10^5\\n-10^9 <= arr[i] <= 10^9')",
  "input_format": "string (describe how input is structured in stdin)",
  "output_format": "string (describe how output should be printed to stdout)",
  "sample_input": "string (raw sample input)",
  "sample_output": "string (expected output for the sample input)",
  "reference_solution": "string (complete, executable Python 3 solution script that reads the entire input from sys.stdin, processes it, and writes the output to sys.stdout. Ensure it handles all edge cases correctly and is optimal)",
  "test_inputs": [
    "string" (6-10 diverse test inputs, including edge cases like empty, min/max limits, random values, large values)
  ],
  "hints": ["vague hint", "more specific hint", "almost-solution hint"],
  "topic_tags": ["tag1", "tag2"],
  "time_complexity": "O(?)",
  "space_complexity": "O(?)"
}

CRITICAL INSTRUCTIONS FOR reference_solution:
1. The solution MUST be written in Python 3 and read standard input using sys.stdin.read() or sys.stdin.readline().
2. Make sure it uses fast parsing. E.g.:
   import sys
   def solve():
       input_data = sys.stdin.read().split()
       if not input_data:
           return
       # parse variables and solve
       # print output to stdout
   if __name__ == '__main__':
       solve()
3. The reference_solution must compile and run without errors. It will be programmatically executed against the test_inputs and sample_input to verify correctness and compute the final test cases.
""")
    return "\n".join(parts)


def generator_agent(state: ProblemState) -> ProblemState:
    """Agent 1: Generates the initial draft of a problem."""
    logger.info("Generator agent running...")
    llm = get_llm_with_fallback()

    user_prompt = build_user_prompt(state)

    # If there's an error from a previous validation run, append it to user prompt for self-correction!
    previous_error = state.get("error")
    if previous_error:
        logger.info(f"Retrying generation with self-correction for error: {previous_error}")
        user_prompt += f"\n\n⚠️ ATTENTION: Your previous attempt failed validation/compilation with the following error:\n{previous_error}\n\nPlease analyze this traceback/error, identify the bug in your python reference solution or input formatting, and generate a corrected version of the problem."

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=user_prompt)
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
        if raw.endswith("```"):
            raw = raw[:-3].strip()

        logger.error("RAW RESPONSE START")
        logger.error(raw)
        logger.error("RAW RESPONSE END")

        data = json.loads(raw)
        problem = GeneratedProblem(**data)

        logger.info(f"Generator produced: '{problem.title}' ({problem.difficulty})")
        return {**state, "draft_problem": problem, "error": None}

    except (json.JSONDecodeError, Exception) as e:
        logger.error(f"Generator agent failed: {e}")
        return {**state, "error": f"Generator failed: {str(e)}"}