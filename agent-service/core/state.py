from typing import Optional
from schemas.problem import GeneratedProblem, ValidationResult, GenerateRequest


class ProblemState(dict):
    """
    Shared state object passed between all agents in the LangGraph pipeline.
    """
    # Input
    request: GenerateRequest

    # Generator agent output
    draft_problem: Optional[GeneratedProblem]

    # Validator agent output
    validation: Optional[ValidationResult]

    # Final problem (the validated/completed problem ready for use)
    final_problem: Optional[GeneratedProblem]

    # Retry tracking
    retry_count: int
    error: Optional[str]