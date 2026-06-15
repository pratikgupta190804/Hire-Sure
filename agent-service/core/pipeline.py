import os
import logging
from langgraph.graph import StateGraph, END
from core.state import ProblemState
from agents.generator import generator_agent
from agents.validator import validator_agent

logger = logging.getLogger(__name__)

QUALITY_THRESHOLD = float(os.getenv("QUALITY_THRESHOLD", "7"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))


def should_retry_or_proceed(state: ProblemState) -> str:
    """
    Routing function after validation.
    If quality score is too low AND we haven't hit max retries, regenerate.
    Otherwise complete the pipeline.
    """
    validation = state.get("validation")
    retry_count = state.get("retry_count", 0)

    # If an error occurred and we have retries left, trigger a retry
    if state.get("error"):
        if retry_count < MAX_RETRIES:
            logger.warning(f"Error in state, retrying (attempt {retry_count + 1}/{MAX_RETRIES}): {state['error']}")
            return "retry"
        logger.warning(f"Error in state, max retries reached. Proceeding to END: {state['error']}")
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
    # Retain the error in the state so the generator can use it for self-correction,
    # but clear draft_problem to regenerate.
    return {
        **state,
        "retry_count": state.get("retry_count", 0) + 1,
        "draft_problem": None
    }


def build_pipeline():
    """
    Builds and compiles the LangGraph pipeline.

    Flow (OPTIMIZED):
        generate → validate (programmatic) → [retry? → generate again] → END
    """
    graph = StateGraph(ProblemState)

    # Register nodes
    graph.add_node("generate",        generator_agent)
    graph.add_node("validate",        validator_agent)
    graph.add_node("increment_retry", increment_retry)

    # Entry point
    graph.set_entry_point("generate")

    # Linear edges
    graph.add_edge("generate", "validate")
    graph.add_edge("increment_retry", "generate")

    # Conditional edge after validation: retry or complete
    graph.add_conditional_edges(
        "validate",
        should_retry_or_proceed,
        {
            "retry":   "increment_retry",
            "proceed": END,
        }
    )

    return graph.compile()


# Singleton — compiled once at startup
problem_pipeline = build_pipeline()