"""
CortexDesk — Tests for WorkspaceTools & Safe Calculator (Task 2.2.2)

Verifies:
- Numeric calculation accuracy for permitted operators (+, -, *, /, //, %, **).
- Strict AST allowlisting (rejection of names, calls, attributes, imports, lambdas, comprehensions).
- Rejection of booleans, strings, and non-numeric constants.
- Resource limits: max expression length (200), max exponent (100), AST depth, node count, and overflow.
- Controlled error handling for division by zero.
- Tool registration on FastMCP("WorkspaceTools").
"""

import pytest
from mcp_server import (
    mcp,
    calculate_expression,
    evaluate_expression,
    CalculatorError,
    MAX_EXPRESSION_LENGTH,
)


# ==============================================================================
# 1. Verification of Accurate Numeric Evaluations
# ==============================================================================

def test_calculator_required_expressions():
    """Verify exact results for the task acceptance criteria."""
    assert calculate_expression("0.175 * 2340") == "409.5"
    assert calculate_expression("17.5 / 100 * 2340") == "409.5"
    assert evaluate_expression("0.175 * 2340") == 409.5
    assert evaluate_expression("17.5 / 100 * 2340") == 409.5


def test_calculator_basic_binary_operators():
    """Verify supported binary arithmetic operators: +, -, *, /, //, %, **."""
    assert evaluate_expression("10 + 25") == 35
    assert evaluate_expression("50 - 18") == 32
    assert evaluate_expression("6 * 7") == 42
    assert evaluate_expression("100 / 4") == 25.0
    assert evaluate_expression("100 // 3") == 33
    assert evaluate_expression("100 % 3") == 1
    assert evaluate_expression("2 ** 8") == 256
    assert calculate_expression("2 ** 8") == "256"


def test_calculator_unary_operators_and_parentheses():
    """Verify unary plus, unary minus, and parenthesized grouping."""
    assert evaluate_expression("-42") == -42
    assert evaluate_expression("+42") == 42
    assert evaluate_expression("-(-10)") == 10
    assert evaluate_expression("-(5 + 3) * 2") == -16
    assert evaluate_expression("((2 + 3) * (4 - 1)) ** 2") == 225
    assert calculate_expression("((2 + 3) * (4 - 1)) ** 2") == "225"


def test_calculator_floating_point_arithmetic():
    """Verify float operations and scientific notation."""
    assert evaluate_expression("1.25 + 2.75") == 4.0
    assert evaluate_expression("1e3 * 2") == 2000.0
    assert evaluate_expression("2 ** -2") == 0.25
    assert calculate_expression("2 ** -2") == "0.25"


# ==============================================================================
# 2. Strict AST Allowlist & Code Execution Rejections
# ==============================================================================

def test_calculator_rejects_code_execution_and_imports():
    """Verify that dangerous imports, calls, and execution attempts are rejected."""
    dangerous = [
        "__import__('os').listdir()",
        "__import__('sys').exit()",
        "eval('2 + 2')",
        "exec('x = 1')",
        "open('/etc/passwd')",
        "compile('1', '', 'eval')",
    ]
    for expr in dangerous:
        # evaluate_expression must raise CalculatorError
        with pytest.raises(CalculatorError):
            evaluate_expression(expr)
        # calculate_expression tool must return controlled error
        result = calculate_expression(expr)
        assert result.startswith("Error:"), f"Expected error for {expr}, got: {result}"


def test_calculator_rejects_attribute_access():
    """Verify that attribute access such as (1).__class__ is rejected."""
    attrs = [
        "(1).__class__",
        "(1).__dict__",
        "().__class__.__bases__",
        "(5).to_bytes(1, 'big')",
    ]
    for expr in attrs:
        with pytest.raises(CalculatorError):
            evaluate_expression(expr)
        result = calculate_expression(expr)
        assert result.startswith("Error:"), f"Expected error for {expr}, got: {result}"


def test_calculator_rejects_names_and_variables():
    """Verify that variable names and built-in names are rejected."""
    names = ["x", "pi", "print", "len", "None", "True", "False"]
    for expr in names:
        with pytest.raises(CalculatorError):
            evaluate_expression(expr)
        result = calculate_expression(expr)
        assert result.startswith("Error:")


def test_calculator_rejects_booleans():
    """Verify that booleans are strictly rejected even though bool subclasses int in Python."""
    bool_exprs = [
        "True",
        "False",
        "True + 1",
        "False * 10",
        "1 + True",
        "True == True",
    ]
    for expr in bool_exprs:
        with pytest.raises(CalculatorError):
            evaluate_expression(expr)
        result = calculate_expression(expr)
        assert result.startswith("Error:")


def test_calculator_rejects_strings_and_containers():
    """Verify that string constants, lists, dicts, sets, and tuples are rejected."""
    containers = [
        "'hello'",
        "\"world\"",
        "[1, 2, 3]",
        "{'a': 1}",
        "{1, 2}",
        "(1, 2)",
        "[1][0]",
    ]
    for expr in containers:
        with pytest.raises(CalculatorError):
            evaluate_expression(expr)
        result = calculate_expression(expr)
        assert result.startswith("Error:")


def test_calculator_rejects_unsupported_operators():
    """Verify bitwise and comparison operators are rejected."""
    unsupported = [
        "1 << 2",
        "8 >> 1",
        "5 & 3",
        "5 | 3",
        "5 ^ 3",
        "~5",
        "1 < 2",
        "1 == 1",
        "not 1",
    ]
    for expr in unsupported:
        with pytest.raises(CalculatorError):
            evaluate_expression(expr)
        result = calculate_expression(expr)
        assert result.startswith("Error:")


# ==============================================================================
# 3. Resource Limits & Division by Zero
# ==============================================================================

def test_calculator_rejects_overlong_expression():
    """Verify that expressions exceeding 200 characters are rejected promptly."""
    overlong = "1 + " * 100 + "1"  # > 400 characters
    assert len(overlong) > MAX_EXPRESSION_LENGTH
    with pytest.raises(CalculatorError) as exc_info:
        evaluate_expression(overlong)
    assert "exceeds maximum limit" in str(exc_info.value)
    result = calculate_expression(overlong)
    assert result.startswith("Error:")
    assert "exceeds maximum limit" in result


def test_calculator_rejects_exponent_magnitudes_over_100():
    """Verify that exponents > 100 and < -100 are rejected."""
    with pytest.raises(CalculatorError) as exc_info:
        evaluate_expression("2 ** 101")
    assert "exceeds maximum limit of 100" in str(exc_info.value)

    with pytest.raises(CalculatorError):
        evaluate_expression("2 ** -101")

    result = calculate_expression("2 ** 101")
    assert result.startswith("Error:")
    assert "exceeds maximum limit of 100" in result


def test_calculator_rejects_nested_exponential_blowup():
    """Verify that nested exponentiation cannot bypass magnitude boundaries."""
    # (2**2)**101 -> right is 101, rejected
    with pytest.raises(CalculatorError):
        evaluate_expression("(2 ** 2) ** 101")

    # 2 ** (3 ** 5) -> 3**5 = 243, exponent > 100, rejected
    with pytest.raises(CalculatorError):
        evaluate_expression("2 ** (3 ** 5)")

    # (10 ** 50) ** 10 -> bit length exceeds safety threshold
    with pytest.raises(CalculatorError):
        evaluate_expression("(10 ** 50) ** 10")

    assert calculate_expression("(10 ** 50) ** 10").startswith("Error:")


def test_calculator_division_by_zero_returns_controlled_error():
    """Verify division, floor division, and modulo by zero return controlled errors."""
    for expr in ["1 / 0", "10 // 0", "5 % 0", "1 / (2 - 2)"]:
        with pytest.raises(ZeroDivisionError):
            evaluate_expression(expr)
        result = calculate_expression(expr)
        assert result.startswith("Error:")
        assert "Division by zero" in result


def test_calculator_rejects_empty_and_whitespace():
    """Verify empty or whitespace-only expressions are rejected."""
    for empty in ["", "   ", "\t\n"]:
        with pytest.raises(CalculatorError):
            evaluate_expression(empty)
        result = calculate_expression(empty)
        assert result.startswith("Error:")


def test_calculator_rejects_invalid_syntax():
    """Verify that syntax errors are rejected cleanly."""
    invalid_syntax_cases = ["1 +", "(1 + 2", "1 + * 2", "1 2", "* 5", "()"]
    for expr in invalid_syntax_cases:
        with pytest.raises((SyntaxError, CalculatorError)):
            evaluate_expression(expr)
        result = calculate_expression(expr)
        assert result.startswith("Error:"), f"Expected error for {expr}, got {result}"


def test_calculator_rejects_overflow_and_non_finite_results():
    """Verify that arithmetic overflow and non-finite floats are rejected safely."""
    overflow_cases = ["1e308 * 10", "1e200 ** 2", "1e300 * 1e100"]
    for expr in overflow_cases:
        with pytest.raises(CalculatorError) as exc_info:
            evaluate_expression(expr)
        assert "overflow" in str(exc_info.value).lower() or "magnitude" in str(exc_info.value).lower()
        result = calculate_expression(expr)
        assert result.startswith("Error:")


def test_calculator_rejects_ast_depth_and_node_count():
    """Verify AST depth and node limits protect against recursive nesting."""
    # Deep nested binary operations: 1 + (1 + (1 + ...))
    deep = "1 + (" * 18 + "1" + ")" * 18
    with pytest.raises(CalculatorError) as exc_info:
        evaluate_expression(deep)
    assert "Expression too complex" in str(exc_info.value)
    assert calculate_expression(deep).startswith("Error:")


# ==============================================================================
# 4. MCP Server & Tool Registration
# ==============================================================================

def test_fastmcp_server_registration():
    """Verify WorkspaceTools FastMCP instance registers calculate_expression."""
    assert mcp.name == "WorkspaceTools"

    # Verify tool is registered in internal tool registry
    if hasattr(mcp, "list_tools"):
        import asyncio
        tools = asyncio.run(mcp.list_tools())
        tool_names = [t.name for t in tools]
        assert "calculate_expression" in tool_names
