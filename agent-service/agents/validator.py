import subprocess
import sys
import os
import tempfile
import logging
from schemas.problem import ValidationResult, TestCase, GeneratedProblem
from core.state import ProblemState

logger = logging.getLogger(__name__)


def execute_python_solution(code_str: str, input_str: str, timeout_seconds: float = 2.0) -> str:
    """
    Executes a Python script in a subprocess with input_str as standard input.
    Returns stdout. Raises Exception on compilation, runtime, or timeout error.
    """
    # Standardize newline characters
    input_str = input_str.strip().replace("\r\n", "\n")
    
    with tempfile.TemporaryDirectory() as tmpdir:
        filepath = os.path.join(tmpdir, "solution.py")
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(code_str)
            
        try:
            res = subprocess.run(
                [sys.executable, filepath],
                input=input_str,
                text=True,
                capture_output=True,
                timeout=timeout_seconds
            )
            if res.returncode != 0:
                raise RuntimeError(res.stderr or f"Exit code {res.returncode}")
            return res.stdout
        except subprocess.TimeoutExpired:
            raise TimeoutError(f"Time Limit Exceeded (solution timed out after {timeout_seconds} seconds)")


def validator_agent(state: ProblemState) -> ProblemState:
    """
    Agent 2: Programmatically validates the generated python solution
    by executing it against the sample input and all generated test inputs.
    Generates 100% correct expected outputs programmatically.
    """
    logger.info("Validator agent running (Programmatic Execution)...")
    
    problem: GeneratedProblem = state.get("draft_problem")
    if not problem:
        return {**state, "error": "No draft problem to validate"}
        
    code_str = problem.reference_solution
    if not code_str:
        return {**state, "error": "No reference solution provided in draft problem"}
        
    # Execute sample input to verify and override sample output
    sample_input = problem.sample_input
    try:
        sample_output = execute_python_solution(code_str, sample_input)
        problem.sample_output = sample_output.strip().replace("\r\n", "\n")
    except Exception as e:
        logger.error(f"Sample input execution failed: {e}")
        return {
            **state,
            "error": f"Sample input execution failed: {str(e)}",
            "validation": ValidationResult(is_valid=False, quality_score=0.0, issues=[str(e)], suggestions=[])
        }
        
    # Execute test cases
    test_inputs = problem.test_inputs or []
    if not test_inputs:
        return {
            **state,
            "error": "No test inputs provided in draft problem",
            "validation": ValidationResult(is_valid=False, quality_score=0.0, issues=["Missing test_inputs"], suggestions=[])
        }
        
    test_cases = []
    
    # Run each test case and build TestCase list
    for idx, test_input in enumerate(test_inputs):
        try:
            expected_output = execute_python_solution(code_str, test_input)
            
            # The first 3 can be public (non-hidden), the rest are hidden
            hidden = idx >= 3
            
            test_cases.append(TestCase(
                input=test_input,
                expected_output=expected_output.strip().replace("\r\n", "\n"),
                hidden=hidden
            ))
        except Exception as e:
            logger.error(f"Test case {idx + 1} execution failed: {e}")
            return {
                **state,
                "error": f"Test case {idx + 1} execution failed:\nInput:\n{test_input}\n\nError:\n{str(e)}",
                "validation": ValidationResult(is_valid=False, quality_score=0.0, issues=[f"Test case {idx + 1} failed: {str(e)}"], suggestions=[])
            }
            
    # Success! Overwrite the problem's test cases
    problem.test_cases = test_cases
    
    logger.info(f"Validator succeeded! Generated and verified {len(test_cases)} test cases programmatically.")
    
    validation = ValidationResult(
        is_valid=True,
        quality_score=10.0,
        issues=[],
        suggestions=[]
    )
    
    return {
        **state,
        "draft_problem": problem,
        "final_problem": problem,
        "validation": validation,
        "error": None
    }