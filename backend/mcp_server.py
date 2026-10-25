"""
CortexDesk — WorkspaceTools MCP Server, Safe Calculator & Web Search (Task 2.2.3)

Provides a standalone Model Context Protocol (FastMCP) server named 'WorkspaceTools'
featuring:
1. 'calculate_expression': A hardened numeric calculator evaluating exclusively via recursive AST allowlisting.
2. 'web_search': Structured web search using Tavily Python SDK with query validation, length caps, and sanitized errors.
"""

import ast
import logging
import math
import sys
from typing import Any, Dict, List, Optional, Union

import requests

try:
    from mcp.server.fastmcp import FastMCP
except (ImportError, ModuleNotFoundError):
    from mcp.server.mcpserver import MCPServer as FastMCP

from config import get_settings
from tavily import TavilyClient
from tavily.errors import (
    BadRequestError,
    InvalidAPIKeyError,
    MissingAPIKeyError,
    UsageLimitExceededError,
)


# Configure logging exclusively to sys.stderr so stdout remains clean for MCP stdio protocol
logging.basicConfig(
    stream=sys.stderr,
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("WorkspaceTools")

# Calculator resource limits
MAX_EXPRESSION_LENGTH = 200
MAX_AST_NODES = 50
MAX_AST_DEPTH = 15
MAX_EXPONENT_MAGNITUDE = 100
MAX_RESULT_MAGNITUDE = 1e100
MAX_BIT_LENGTH_POWER = 350

# Web search resource limits
MAX_SEARCH_QUERY_LENGTH = 400
MIN_SEARCH_RESULTS = 1
MAX_SEARCH_RESULTS = 8
DEFAULT_SEARCH_RESULTS = 5
MAX_SNIPPET_LENGTH = 500
SEARCH_TIMEOUT_SECONDS = 15.0


class CalculatorError(ValueError):
    """Base error raised when an expression fails AST validation or runtime limits."""
    pass


def _eval(node: ast.AST, depth: int = 0) -> Union[int, float]:
    """
    Recursively evaluates an AST node strictly according to the safe calculator allowlist.
    Permits only:
      - ast.Expression
      - ast.Constant (int, float; strictly excluding bool)
      - ast.UnaryOp (+, -)
      - ast.BinOp (+, -, *, /, //, %, **)
    Rejects all other AST nodes including Name, Call, Attribute, Subscript, Import, etc.
    """
    if depth > MAX_AST_DEPTH:
        raise CalculatorError(f"Expression too complex: AST depth exceeds limit of {MAX_AST_DEPTH}")

    if isinstance(node, ast.Expression):
        return _eval(node.body, depth + 1)

    if isinstance(node, ast.Constant):
        val = node.value
        # In Python, bool is a subclass of int (isinstance(True, int) is True). Must reject bool explicitly.
        if isinstance(val, bool):
            raise CalculatorError("Booleans (True/False) are not permitted in numeric expressions")
        if not isinstance(val, (int, float)):
            raise CalculatorError(f"Unsupported constant type '{type(val).__name__}': {val!r}")
        if math.isnan(val) or math.isinf(val):
            raise CalculatorError("Non-finite numeric constants are not permitted")
        if abs(val) > MAX_RESULT_MAGNITUDE:
            raise CalculatorError("Numeric constant exceeds maximum allowed magnitude")
        return val

    if isinstance(node, ast.UnaryOp):
        operand = _eval(node.operand, depth + 1)
        if isinstance(node.op, ast.UAdd):
            res = +operand
        elif isinstance(node.op, ast.USub):
            res = -operand
        else:
            raise CalculatorError(f"Unsupported unary operator: {type(node.op).__name__}")

        if math.isinf(res) or math.isnan(res) or abs(res) > MAX_RESULT_MAGNITUDE:
            raise CalculatorError("Unary operation resulted in a value exceeding allowed magnitude")
        return res

    if isinstance(node, ast.BinOp):
        left = _eval(node.left, depth + 1)
        right = _eval(node.right, depth + 1)

        if isinstance(left, bool) or isinstance(right, bool):
            raise CalculatorError("Booleans are not permitted in binary operations")

        # Zero-division guards for division, floor division, and modulo
        if isinstance(node.op, (ast.Div, ast.FloorDiv, ast.Mod)):
            if right == 0:
                raise ZeroDivisionError("Division by zero")

        # Exponentiation safety constraints
        if isinstance(node.op, ast.Pow):
            if abs(right) > MAX_EXPONENT_MAGNITUDE:
                raise CalculatorError(
                    f"Exponent magnitude ({abs(right)}) exceeds maximum limit of {MAX_EXPONENT_MAGNITUDE}"
                )
            # Guard against huge power computations e.g. (10**50)**10 or 2**300
            if isinstance(left, int) and isinstance(right, int) and right > 0:
                if left.bit_length() * right > MAX_BIT_LENGTH_POWER:
                    raise CalculatorError("Exponentiation result exceeds maximum allowed magnitude")
            # Guard against complex numbers e.g. (-2)**0.5
            if left < 0 and isinstance(right, float) and not right.is_integer():
                raise CalculatorError("Complex numbers resulting from negative roots are not supported")

        try:
            if isinstance(node.op, ast.Add):
                res = left + right
            elif isinstance(node.op, ast.Sub):
                res = left - right
            elif isinstance(node.op, ast.Mult):
                res = left * right
            elif isinstance(node.op, ast.Div):
                res = left / right
            elif isinstance(node.op, ast.FloorDiv):
                res = left // right
            elif isinstance(node.op, ast.Mod):
                res = left % right
            elif isinstance(node.op, ast.Pow):
                res = left ** right
            else:
                raise CalculatorError(f"Unsupported binary operator: {type(node.op).__name__}")
        except OverflowError as exc:
            raise CalculatorError("Calculation resulted in arithmetic overflow") from exc

        if math.isinf(res) or math.isnan(res) or abs(res) > MAX_RESULT_MAGNITUDE:
            raise CalculatorError("Binary operation resulted in a value exceeding allowed magnitude")
        return res

    # Reject any other node type (e.g. Call, Attribute, Name, Subscript, List, Dict, Import, etc.)
    raise CalculatorError(f"Unsupported syntax or AST node: {type(node).__name__}")


def evaluate_expression(expression: str) -> Union[int, float]:
    """
    Parses and evaluates a numeric expression string safely using AST allowlisting.
    Raises CalculatorError, ZeroDivisionError, or SyntaxError on invalid or unsafe input.
    """
    if not isinstance(expression, str):
        raise CalculatorError(f"Expected string expression, received {type(expression).__name__}")

    if len(expression) > MAX_EXPRESSION_LENGTH:
        raise CalculatorError(
            f"Expression length ({len(expression)}) exceeds maximum limit of {MAX_EXPRESSION_LENGTH} characters"
        )

    trimmed = expression.strip()
    if not trimmed:
        raise CalculatorError("Expression cannot be empty or whitespace-only")

    try:
        tree = ast.parse(trimmed, mode="eval")
    except SyntaxError as exc:
        raise CalculatorError(f"Malformed arithmetic syntax: {exc}") from exc

    nodes = list(ast.walk(tree))
    if len(nodes) > MAX_AST_NODES:
        raise CalculatorError(f"Expression too complex: node count ({len(nodes)}) exceeds limit of {MAX_AST_NODES}")

    return _eval(tree)


_tavily_client_override: Optional[TavilyClient] = None


def _get_tavily_client() -> TavilyClient:
    """Instantiates a TavilyClient using TAVILY_API_KEY from server environment settings."""
    if _tavily_client_override is not None:
        return _tavily_client_override
    settings = get_settings()
    api_key = settings.tavily_api_key
    if not api_key or not api_key.strip():
        raise ValueError("Search provider key (TAVILY_API_KEY) is not configured on the server.")
    return TavilyClient(api_key=api_key.strip())


# Instantiate the MCP tool server
mcp = FastMCP("WorkspaceTools")


@mcp.tool()
def calculate_expression(expression: str) -> str:
    """
    Calculates the exact result of a numeric mathematical expression safely using AST evaluation.

    Instruct the assistant to call this tool whenever calculations, arithmetic operations,
    or numeric formulas are needed, instead of calculating mentally.
    Supports basic operators: +, -, *, /, //, %, ** and parenthesized expressions with numbers.
    Rejects names, calls, imports, variables, code execution, and oversized inputs.
    """
    try:
        result = evaluate_expression(expression)
        return str(result)
    except (CalculatorError, ZeroDivisionError) as exc:
        logger.warning("calculate_expression rejected input: %s", exc)
        return f"Error: {exc}"
    except Exception as exc:
        logger.error("calculate_expression unexpected error: %s", exc)
        return f"Error: {exc}"


@mcp.tool()
def web_search(
    query: str,
    max_results: int = DEFAULT_SEARCH_RESULTS,
) -> Union[List[Dict[str, str]], str]:
    """
    Searches the public web for current facts, news, and external information.

    Appropriate whenever questions require recent knowledge, real-time facts,
    or external sources beyond the model's training cutoff.

    CRITICAL SECURITY CONSTRAINT:
    This tool MUST NOT be used to search for or access private CortexDesk projects,
    user workspaces, or confidential internal documents that are not available through
    an authorized application interface.
    """
    # 1. Validate query argument
    if not isinstance(query, str):
        return f"Error: Expected string query, received {type(query).__name__}."

    trimmed_query = query.strip()
    if not trimmed_query:
        return "Error: Search query cannot be empty or whitespace-only."

    if len(trimmed_query) > MAX_SEARCH_QUERY_LENGTH:
        return (
            f"Error: Search query length ({len(trimmed_query)}) exceeds maximum limit of "
            f"{MAX_SEARCH_QUERY_LENGTH} characters."
        )

    # 2. Validate max_results argument
    if isinstance(max_results, bool) or not isinstance(max_results, int):
        return "Error: max_results must be an integer between 1 and 8."

    if not (MIN_SEARCH_RESULTS <= max_results <= MAX_SEARCH_RESULTS):
        return f"Error: max_results must be between {MIN_SEARCH_RESULTS} and {MAX_SEARCH_RESULTS}."

    # 3. Execute search via provider
    try:
        tavily_client = _get_tavily_client()
        response = tavily_client.search(
            query=trimmed_query,
            max_results=max_results,
            timeout=SEARCH_TIMEOUT_SECONDS,
        )
    except ValueError as exc:
        logger.error("Configuration error in web_search: %s", exc)
        return f"Error: {exc}"
    except (InvalidAPIKeyError, MissingAPIKeyError):
        logger.error("Tavily authentication failed for web_search")
        return "Error: Search provider authentication failed. Check server configuration."
    except UsageLimitExceededError:
        logger.warning("Tavily usage limit exceeded for web_search")
        return "Error: Search provider quota or rate limit exceeded. Please try again later."
    except (requests.Timeout, TimeoutError):
        logger.warning("Tavily search request timed out for query: %s...", trimmed_query[:30])
        return "Error: Search request timed out. Please try again shortly."
    except Exception as exc:
        logger.error("Tavily search request failed: %s", type(exc).__name__)
        return f"Error: Search provider temporarily unavailable: {type(exc).__name__}"

    # 4. Parse, validate, and bound results
    raw_results = response.get("results", []) if isinstance(response, dict) else []
    clean_results: List[Dict[str, str]] = []

    for item in raw_results:
        if not isinstance(item, dict):
            continue

        url = str(item.get("url") or "").strip()
        # Validate returned URL scheme (must be valid HTTP/HTTPS)
        if not (url.startswith("http://") or url.startswith("https://")):
            continue

        title = str(item.get("title") or "Untitled").strip()
        raw_content = str(item.get("content") or "").strip()
        snippet = raw_content[:MAX_SNIPPET_LENGTH]

        clean_results.append({
            "title": title,
            "url": url,
            "snippet": snippet,
        })

        if len(clean_results) >= max_results:
            break

    return clean_results


if __name__ == "__main__":
    # Run the FastMCP server over standard input/output transport
    mcp.run(transport="stdio")
