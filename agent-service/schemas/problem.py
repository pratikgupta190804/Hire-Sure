from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class Difficulty(str, Enum):
    EASY = "EASY"
    MEDIUM = "MEDIUM"
    HARD = "HARD"


class TestCase(BaseModel):
    input: str = Field(description="Input for this test case")
    expected_output: str = Field(description="Expected output for this test case")
    hidden: bool = Field(default=False, description="Hidden from users until submission")


class GeneratedProblem(BaseModel):
    """Fully structured problem — validated before sending to Spring Boot."""
    title: str = Field(description="Short problem title e.g. 'Two Sum'")
    description: str = Field(description="Full markdown problem statement")
    difficulty: Difficulty
    constraints: str = Field(description="Constraints e.g. '1 <= n <= 10^4'")
    input_format: str = Field(description="Description of input format")
    output_format: str = Field(description="Description of expected output format")
    sample_input: str = Field(description="One visible sample input")
    sample_output: str = Field(description="Expected output for sample input")
    test_cases: list[TestCase] = Field(description="5-10 test cases including edge cases")
    hints: list[str] = Field(description="3 progressive hints from vague to specific")
    topic_tags: list[str] = Field(description="e.g. ['arrays', 'hash-map', 'two-pointers']")
    time_complexity: str = Field(description="Expected optimal solution e.g. O(n)")
    space_complexity: str = Field(description="Expected optimal solution e.g. O(n)")


class ValidationResult(BaseModel):
    """Quality assessment returned by the Validator agent."""
    is_valid: bool
    quality_score: float = Field(ge=0, le=10, description="Overall quality 0-10")
    issues: list[str] = Field(default_factory=list, description="List of issues found")
    suggestions: list[str] = Field(default_factory=list, description="Improvements to make")


class GenerateRequest(BaseModel):
    """Incoming request from Spring Boot or direct API call."""
    topic: Optional[str] = Field(default=None, description="e.g. 'dynamic programming'")
    difficulty: Optional[Difficulty] = Field(default=None)
    company_style: Optional[str] = Field(default=None, description="e.g. 'Google', 'Amazon'")
    count: int = Field(default=1, ge=1, le=10, description="Number of problems to generate")


class GenerateResponse(BaseModel):
    """Response returned to the caller."""
    success: bool
    problems_generated: int
    problems: list[GeneratedProblem]
    message: str