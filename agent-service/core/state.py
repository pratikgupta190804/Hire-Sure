from typing import Optional, Annotated
from langgraph.graph.message import add_messages
from schemas.problem import GeneratedProblem, ValidationResult, GenerateRequest
import operator


class ProblemState(dict):
    """
    Shared state object passed between all agents in the LangGraph pipeline.
    Each agent reads what it needs and writes its own output key.
    """
    # Input
    request: GenerateRequest

    # Generator agent output
    draft_problem: Optional[GeneratedProblem]

    # Validator agent output
    validation: Optional[ValidationResult]

    # After validation — refined problem (may be same as draft if already good)
    refined_problem: Optional[GeneratedProblem]

    # Test case agent output (merged into refined_problem)
    test_cases_added: bool

    # Difficulty agent output
    difficulty_confirmed: bool

    # Hint agent output
    hints_added: bool

    # Final
    final_problem: Optional[GeneratedProblem]

    # Retry tracking
    retry_count: int
    error: Optional[str]