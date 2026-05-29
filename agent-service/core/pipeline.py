import os
import logging
from langgraph.graph import StateGraph, END
from core.state import ProblemState
from agents.generator import generator_agent
from agents.validator import validator_agent
from agents.test_case_generator import test_case_generator_agent
from agents.difficulty_analyzer import difficulty_analyzer_agent
from agents.hint_generator import hint_generator_agent

logger = logging.getLogger(__name__)

QUALITY_THRESHOLD = float(os.getenv("QUALITY_THRESHOLD", "7"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))


def should_retry_or_proceed(state: ProblemState) -> str:
    """
    Routing function after validation.
    If quality score is too low AND we haven't hit max retries, regenerate.
    Otherwise proceed to test case generation.
    """
    validation = state.get("validation")
    retry_count = state.get("retry_count", 0)

    if state.get("error"):
        logger.warning(f"Error in state, proceeding anyway: {state['error']}")
        return "proceed"

    if validation and validation.quality_score < QUALITY_THRESHOLD and retry_count < MAX_RETRIES:
        logger.info(
            f"Quality score {validation.quality_score} < {QUALITY_THRESHOLD}. "
            f"Retrying... (attempt {retry_count + 1}/{MAX_RETRIES})"
        )
        return "retry"

    return "proceed"


def increment_retry(state: ProblemState) -> ProblemState:
    """Increments retry counter before regenerating."""
    return {**state, "retry_count": state.get("retry_count", 0) + 1, "draft_problem": None}


def build_pipeline():
    """
    Builds and compiles the LangGraph pipeline.

    Flow:
        generate → validate → [retry? → generate again] → test_cases → difficulty → hints → END
    """
    graph = StateGraph(ProblemState)

    # Register all agent nodes
    graph.add_node("generate",       generator_agent)
    graph.add_node("validate",       validator_agent)
    graph.add_node("increment_retry", increment_retry)
    graph.add_node("test_cases",     test_case_generator_agent)
    graph.add_node("difficulty",     difficulty_analyzer_agent)
    graph.add_node("hints",          hint_generator_agent)

    # Entry point
    graph.set_entry_point("generate")

    # Linear edges
    graph.add_edge("generate", "validate")
    graph.add_edge("increment_retry", "generate")
    graph.add_edge("test_cases", "difficulty")
    graph.add_edge("difficulty", "hints")
    graph.add_edge("hints", END)

    # Conditional edge after validation: retry or proceed
    graph.add_conditional_edges(
        "validate",
        should_retry_or_proceed,
        {
            "retry":   "increment_retry",
            "proceed": "test_cases",
        }
    )

    return graph.compile()


# Singleton — compiled once at startup
problem_pipeline = build_pipeline()