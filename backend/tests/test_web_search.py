"""
CortexDesk — Tests for WorkspaceTools web_search MCP Tool (Task 2.2.3)

Verifies:
- Argument validation: empty query, overlong query, non-string query, invalid max_results.
- Structured result formatting: title, url, snippet bounded to 500 chars.
- URL validation: non-HTTP/HTTPS URLs filtered out.
- Controlled error handling: missing API key, timeout, rate limit/quota, auth failure, network errors.
- Both calculate_expression and web_search are registered in FastMCP("WorkspaceTools").
"""

from unittest.mock import MagicMock
import pytest
from tavily.errors import InvalidAPIKeyError, UsageLimitExceededError

import mcp_server
from mcp_server import (
    mcp,
    web_search,
    MAX_SEARCH_QUERY_LENGTH,
    MAX_SNIPPET_LENGTH,
    MAX_SEARCH_RESULTS,
)


@pytest.fixture(autouse=True)
def reset_tavily_override():
    """Ensure mock client override is reset after each test."""
    mcp_server._tavily_client_override = None
    yield
    mcp_server._tavily_client_override = None


# ==============================================================================
# 1. Argument Validation Tests
# ==============================================================================

def test_web_search_rejects_empty_and_whitespace_query():
    """Verify empty or whitespace-only search queries are rejected cleanly."""
    for empty in ["", "   ", "\t\n  "]:
        res = web_search(empty)
        assert isinstance(res, str)
        assert res.startswith("Error:")
        assert "cannot be empty" in res


def test_web_search_rejects_non_string_query():
    """Verify non-string query types are rejected."""
    for invalid in [None, 123, ["python"], {"query": "python"}]:
        res = web_search(invalid)  # type: ignore[arg-type]
        assert isinstance(res, str)
        assert res.startswith("Error:")
        assert "Expected string query" in res


def test_web_search_rejects_overlong_query():
    """Verify queries exceeding 400 characters are rejected."""
    overlong = "a" * (MAX_SEARCH_QUERY_LENGTH + 1)
    res = web_search(overlong)
    assert isinstance(res, str)
    assert res.startswith("Error:")
    assert "exceeds maximum limit" in res


def test_web_search_rejects_invalid_max_results():
    """Verify max_results bounds [1, 8] and type checking."""
    # Out of bounds
    for out_of_bounds in [0, -1, 9, 50]:
        res = web_search("python", max_results=out_of_bounds)
        assert isinstance(res, str)
        assert res.startswith("Error:")
        assert "must be between 1 and 8" in res

    # Invalid types (booleans, floats, strings)
    for invalid_type in [True, False, 2.5, "5", None]:
        res = web_search("python", max_results=invalid_type)  # type: ignore[arg-type]
        assert isinstance(res, str)
        assert res.startswith("Error:")
        assert "must be an integer" in res


# ==============================================================================
# 2. Result Structure & URL Validation
# ==============================================================================

def test_web_search_structured_results_formatting():
    """Verify that results conform to the required title, url, snippet structure."""
    long_content = "Word " * 200  # > 500 characters
    mock_tavily = MagicMock()
    mock_tavily.search.return_value = {
        "results": [
            {
                "title": "Python 3.12 Release Notes",
                "url": "https://docs.python.org/3.12/",
                "content": long_content,
            },
            {
                "title": "Wikipedia: Python",
                "url": "http://en.wikipedia.org/wiki/Python",
                "content": "Short summary of Python.",
            },
        ]
    }
    mcp_server._tavily_client_override = mock_tavily

    res = web_search("python 3.12", max_results=5)
    assert isinstance(res, list)
    assert len(res) == 2

    first = res[0]
    assert first["title"] == "Python 3.12 Release Notes"
    assert first["url"] == "https://docs.python.org/3.12/"
    assert len(first["snippet"]) == MAX_SNIPPET_LENGTH
    assert first["snippet"] == long_content[:MAX_SNIPPET_LENGTH]

    second = res[1]
    assert second["title"] == "Wikipedia: Python"
    assert second["url"] == "http://en.wikipedia.org/wiki/Python"
    assert second["snippet"] == "Short summary of Python."


def test_web_search_discards_invalid_urls():
    """Verify non-HTTP/HTTPS URLs (javascript:, file:, malformed) are discarded."""
    mock_tavily = MagicMock()
    mock_tavily.search.return_value = {
        "results": [
            {"title": "Valid HTTPS", "url": "https://example.com", "content": "Valid"},
            {"title": "Malicious JS", "url": "javascript:alert(1)", "content": "Bad"},
            {"title": "Local File", "url": "file:///etc/passwd", "content": "Bad"},
            {"title": "Empty URL", "url": "", "content": "Bad"},
            {"title": "Valid HTTP", "url": "http://example.org", "content": "Valid HTTP"},
        ]
    }
    mcp_server._tavily_client_override = mock_tavily

    res = web_search("test query", max_results=5)
    assert isinstance(res, list)
    assert len(res) == 2
    assert [r["url"] for r in res] == ["https://example.com", "http://example.org"]


def test_web_search_bounds_results_to_max_results():
    """Verify no more than max_results items are returned even if provider returns more."""
    mock_tavily = MagicMock()
    mock_tavily.search.return_value = {
        "results": [
            {"title": f"Result {i}", "url": f"https://example.com/{i}", "content": f"Content {i}"}
            for i in range(15)
        ]
    }
    mcp_server._tavily_client_override = mock_tavily

    res = web_search("bounded query", max_results=3)
    assert isinstance(res, list)
    assert len(res) == 3


# ==============================================================================
# 3. Controlled Error Handling
# ==============================================================================

def test_web_search_missing_api_key(monkeypatch):
    """Verify controlled error when TAVILY_API_KEY is not configured."""
    monkeypatch.setattr("mcp_server.get_settings", lambda: MagicMock(tavily_api_key=""))
    res = web_search("python")
    assert isinstance(res, str)
    assert res.startswith("Error:")
    assert "TAVILY_API_KEY" in res
    assert "not configured" in res


def test_web_search_auth_failure():
    """Verify provider authentication errors map to controlled messages."""
    mock_tavily = MagicMock()
    mock_tavily.search.side_effect = InvalidAPIKeyError("Invalid API Key provided")
    mcp_server._tavily_client_override = mock_tavily

    res = web_search("python")
    assert isinstance(res, str)
    assert res.startswith("Error:")
    assert "authentication failed" in res


def test_web_search_quota_exceeded():
    """Verify usage limit errors map to controlled rate-limit messages."""
    mock_tavily = MagicMock()
    mock_tavily.search.side_effect = UsageLimitExceededError("Monthly quota exceeded")
    mcp_server._tavily_client_override = mock_tavily

    res = web_search("python")
    assert isinstance(res, str)
    assert res.startswith("Error:")
    assert "quota or rate limit exceeded" in res


def test_web_search_timeout_error():
    """Verify timeouts return a clear, bounded error."""
    mock_tavily = MagicMock()
    mock_tavily.search.side_effect = TimeoutError("Request timed out")
    mcp_server._tavily_client_override = mock_tavily

    res = web_search("python")
    assert isinstance(res, str)
    assert res.startswith("Error:")
    assert "timed out" in res


def test_web_search_network_failure():
    """Verify connection and unexpected errors return sanitized failure messages without stack traces."""
    mock_tavily = MagicMock()
    mock_tavily.search.side_effect = ConnectionError("Connection refused by upstream host")
    mcp_server._tavily_client_override = mock_tavily

    res = web_search("python")
    assert isinstance(res, str)
    assert res.startswith("Error:")
    assert "temporarily unavailable" in res
    assert "ConnectionError" in res


# ==============================================================================
# 4. MCP Discovery & Tool Listing
# ==============================================================================

def test_workspace_tools_lists_both_calculator_and_search():
    """Verify both calculate_expression and web_search are registered on WorkspaceTools."""
    import asyncio
    tools = asyncio.run(mcp.list_tools())
    tool_names = [t.name for t in tools]
    assert "calculate_expression" in tool_names
    assert "web_search" in tool_names

    # Check web_search description includes private document security boundary
    web_search_tool = next(t for t in tools if t.name == "web_search")
    assert "current facts, news" in web_search_tool.description
    assert "MUST NOT be used to search for or access private CortexDesk projects" in web_search_tool.description
