"""
Tests for CortexDesk Agent Loop (Task 2.2.5).

Verifies multi-turn tool orchestration, schema conversion, round-limit enforcement,
argument validation, error handling, output truncation, and timeout controls.
"""

import asyncio
from typing import Any, Dict, List, Optional
import pytest
from google.genai import types

from services.agent import (
    MAX_ROUNDS,
    MAX_ROUNDS_EXHAUSTED_MESSAGE,
    TIMEOUT_MESSAGE,
    ERROR_MESSAGE,
    MAX_TOOL_OUTPUT_CHARS,
    tool_declarations,
    validate_mcp_tool_schema,
    run_agent,
)


# ==============================================================================
# Fakes and Test Doubles
# ==============================================================================

class FakeTool:
    def __init__(self, name: str, description: str = "", input_schema: Optional[Dict[str, Any]] = None):
        self.name = name
        self.description = description
        self.inputSchema = input_schema or {"type": "object", "properties": {}}


class FakeContentItem:
    def __init__(self, text: str):
        self.text = text


class FakeCallToolResult:
    def __init__(self, text: str, is_error: bool = False):
        self.content = [FakeContentItem(text)]
        self.isError = is_error


class FakeMCPClient:
    def __init__(self, tools: Optional[List[FakeTool]] = None):
        self._tools = {t.name: t for t in (tools or [])}
        self.calls: List[tuple[str, dict]] = []
        self.tool_handlers = {}

    @property
    def is_connected(self) -> bool:
        return True

    @property
    def tools(self) -> List[FakeTool]:
        return list(self._tools.values())

    @property
    def tool_names(self) -> List[str]:
        return list(self._tools.keys())

    def register_tool(self, tool: FakeTool, handler=None) -> None:
        self._tools[tool.name] = tool
        if handler:
            self.tool_handlers[tool.name] = handler

    async def call_tool(self, name: str, arguments: Dict[str, Any]):
        self.calls.append((name, arguments))
        if name in self.tool_handlers:
            handler = self.tool_handlers[name]
            if asyncio.iscoroutinefunction(handler):
                return await handler(arguments)
            return handler(arguments)
        return FakeCallToolResult(f"Default result for {name}")


class FakeModelResponse:
    def __init__(
        self,
        text: Optional[str] = None,
        function_calls: Optional[List[types.FunctionCall]] = None,
    ):
        self._text = text or ""
        self.function_calls = function_calls or []

        parts = []
        if self.function_calls:
            for fc in self.function_calls:
                parts.append(
                    types.Part.from_function_call(name=fc.name, args=fc.args or {})
                )
        if self._text or not parts:
            parts.append(types.Part.from_text(text=self._text))

        self.candidates = [
            types.Candidate(
                content=types.Content(
                    role="model",
                    parts=parts,
                )
            )
        ]

    @property
    def text(self) -> str:
        return self._text


class FakeLLMService:
    def __init__(self, responses: List[Any]):
        self.responses = list(responses)
        self.model = "fake-model-id"
        self.calls: List[Dict[str, Any]] = []

        class FakeModels:
            pass

        class FakeAio:
            models = FakeModels()

        class FakeClient:
            aio = FakeAio()

        self.client = FakeClient()
        self.client.aio.models.generate_content = self._generate_content

    async def _generate_content(self, model, contents, config):
        self.calls.append({"model": model, "contents": list(contents), "config": config})
        if not self.responses:
            return FakeModelResponse(text="Fallback final answer")
        resp = self.responses.pop(0)
        if isinstance(resp, Exception):
            raise resp
        return resp


# ==============================================================================
# Unit Tests: Schema Conversion and Tool Declarations
# ==============================================================================

def test_validate_mcp_tool_schema_valid():
    """Valid schemas with standard JSON schema types pass cleanly."""
    valid_schema = {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "count": {"type": "integer"},
            "is_active": {"type": "boolean"},
        },
        "required": ["query"],
    }
    result = validate_mcp_tool_schema("test_tool", valid_schema)
    assert result == valid_schema


def test_validate_mcp_tool_schema_rejects_non_dict():
    """Top-level non-dict schema is rejected with ValueError."""
    with pytest.raises(ValueError, match="must be a dictionary"):
        validate_mcp_tool_schema("bad_tool", "not_a_dict")


def test_validate_mcp_tool_schema_rejects_non_object_root():
    """Top-level schemas that are not type 'object' are rejected."""
    with pytest.raises(ValueError, match="root type must be 'object'"):
        validate_mcp_tool_schema("bad_tool", {"type": "string"})


def test_validate_mcp_tool_schema_rejects_unsupported_property_type():
    """Property types outside supported JSON Schema primitives are rejected."""
    bad_schema = {
        "type": "object",
        "properties": {
            "bad_prop": {"type": "unsupported_custom_type"},
        },
    }
    with pytest.raises(ValueError, match="Unsupported type 'unsupported_custom_type'"):
        validate_mcp_tool_schema("bad_tool", bad_schema)


def test_tool_declarations_dynamically_includes_new_tools():
    """Verifies that newly registered tools in MCP client appear dynamically without host code changes."""
    calc_tool = FakeTool(
        name="calculate_expression",
        description="Math calculator",
        input_schema={"type": "object", "properties": {"expression": {"type": "string"}}},
    )
    client = FakeMCPClient([calc_tool])

    decls = tool_declarations(client)
    assert len(decls) == 1
    assert decls[0].name == "calculate_expression"

    # Register a new tool at runtime
    search_tool = FakeTool(
        name="web_search",
        description="Search web",
        input_schema={"type": "object", "properties": {"query": {"type": "string"}}},
    )
    client.register_tool(search_tool)

    decls_updated = tool_declarations(client)
    assert len(decls_updated) == 2
    assert {d.name for d in decls_updated} == {"calculate_expression", "web_search"}


# ==============================================================================
# Agent Loop Tests
# ==============================================================================

@pytest.mark.asyncio
async def test_direct_answer_without_tool_call():
    """When the model does not request any tools, return its text response immediately."""
    llm = FakeLLMService([FakeModelResponse(text="Hello, how can I help you today?")])
    client = FakeMCPClient()

    reply = await run_agent(prompt="Hello", client=client, llm_service=llm)
    assert reply == "Hello, how can I help you today?"
    assert len(llm.calls) == 1
    assert len(client.calls) == 0


@pytest.mark.asyncio
async def test_one_tool_call_followed_by_final_answer():
    """Model requests calculate_expression, tool runs, model returns final answer."""
    calc_tool = FakeTool(
        name="calculate_expression",
        input_schema={
            "type": "object",
            "properties": {"expression": {"type": "string"}},
            "required": ["expression"],
        },
    )
    client = FakeMCPClient([calc_tool])
    client.tool_handlers["calculate_expression"] = lambda args: FakeCallToolResult("42")

    responses = [
        FakeModelResponse(
            function_calls=[
                types.FunctionCall(
                    name="calculate_expression",
                    args={"expression": "6 * 7"},
                )
            ]
        ),
        FakeModelResponse(text="The calculation result is 42."),
    ]
    llm = FakeLLMService(responses)

    reply = await run_agent(
        prompt="What is 6 * 7?",
        system="You are an assistant.",
        client=client,
        llm_service=llm,
    )

    assert reply == "The calculation result is 42."
    assert len(client.calls) == 1
    assert client.calls[0] == ("calculate_expression", {"expression": "6 * 7"})
    assert len(llm.calls) == 2


@pytest.mark.asyncio
async def test_multiple_tool_calls_in_single_turn():
    """Model requests multiple tools in a single round; both execute and model receives both results."""
    calc_tool = FakeTool("calc", input_schema={"type": "object", "properties": {"x": {"type": "string"}}})
    search_tool = FakeTool("search", input_schema={"type": "object", "properties": {"q": {"type": "string"}}})

    client = FakeMCPClient([calc_tool, search_tool])
    client.tool_handlers["calc"] = lambda args: FakeCallToolResult("100")
    client.tool_handlers["search"] = lambda args: FakeCallToolResult("Found 5 docs")

    responses = [
        FakeModelResponse(
            function_calls=[
                types.FunctionCall(name="calc", args={"x": "50+50"}),
                types.FunctionCall(name="search", args={"q": "fastapi"}),
            ]
        ),
        FakeModelResponse(text="Calc gave 100, and search found 5 docs."),
    ]
    llm = FakeLLMService(responses)

    reply = await run_agent("Do both", client=client, llm_service=llm)
    assert reply == "Calc gave 100, and search found 5 docs."
    assert len(client.calls) == 2


@pytest.mark.asyncio
async def test_tool_failure_followed_by_model_recovery():
    """When a tool raises an error, sanitized error is returned to model and model recovers."""
    failing_tool = FakeTool("fail_tool")
    client = FakeMCPClient([failing_tool])

    def fail_handler(args):
        raise RuntimeError("Internal database connection failed")

    client.tool_handlers["fail_tool"] = fail_handler

    responses = [
        FakeModelResponse(
            function_calls=[types.FunctionCall(name="fail_tool", args={})]
        ),
        FakeModelResponse(text="The tool failed, but here is what I know instead."),
    ]
    llm = FakeLLMService(responses)

    reply = await run_agent("Try tool", client=client, llm_service=llm)
    assert reply == "The tool failed, but here is what I know instead."

    # Verify that the tool error returned to model does not leak the internal message
    second_call_contents = llm.calls[1]["contents"]
    user_turn = second_call_contents[-1]
    func_resp = user_turn.parts[0].function_response
    assert "Tool execution failed: RuntimeError" in func_resp.response["error"]
    assert "Internal database connection" not in func_resp.response["error"]


@pytest.mark.asyncio
async def test_unknown_tool_and_invalid_arguments():
    """Agent intercepts unknown tools and schema validation errors cleanly."""
    valid_tool = FakeTool(
        "test_tool",
        input_schema={
            "type": "object",
            "properties": {"num": {"type": "integer"}},
            "required": ["num"],
        },
    )
    client = FakeMCPClient([valid_tool])

    responses = [
        # Request 1: Unknown tool
        FakeModelResponse(
            function_calls=[types.FunctionCall(name="unknown_tool", args={})]
        ),
        # Request 2: Known tool, but invalid argument type
        FakeModelResponse(
            function_calls=[types.FunctionCall(name="test_tool", args={"num": "not_an_int"})]
        ),
        # Request 3: Recovery
        FakeModelResponse(text="Recovered from invalid requests."),
    ]
    llm = FakeLLMService(responses)

    reply = await run_agent("Test errors", client=client, llm_service=llm)
    assert reply == "Recovered from invalid requests."

    # Check first tool response
    turn1_user = llm.calls[1]["contents"][-1]
    assert "not recognized or available" in turn1_user.parts[0].function_response.response["error"]

    # Check second tool response
    turn2_user = llm.calls[2]["contents"][-1]
    assert "Invalid arguments for tool 'test_tool'" in turn2_user.parts[0].function_response.response["error"]


@pytest.mark.asyncio
async def test_empty_model_response():
    """An empty model response text is returned as empty string without crashing."""
    llm = FakeLLMService([FakeModelResponse(text="")])
    client = FakeMCPClient()

    reply = await run_agent("Hello", client=client, llm_service=llm)
    assert reply == ""


@pytest.mark.asyncio
async def test_repeated_tool_requests_terminate_after_max_rounds():
    """Repeated tool requests terminate cleanly when MAX_ROUNDS (6) is exhausted."""
    calc_tool = FakeTool("calc")
    client = FakeMCPClient([calc_tool])
    client.tool_handlers["calc"] = lambda args: FakeCallToolResult("1")

    # Generate 10 consecutive tool-calling responses (exceeding MAX_ROUNDS = 6)
    responses = [
        FakeModelResponse(function_calls=[types.FunctionCall(name="calc", args={})])
        for _ in range(10)
    ]
    llm = FakeLLMService(responses)

    reply = await run_agent(
        "Infinite loop prompt",
        client=client,
        llm_service=llm,
        max_rounds=MAX_ROUNDS,
    )

    assert reply == MAX_ROUNDS_EXHAUSTED_MESSAGE
    # Exactly MAX_ROUNDS (6) tool rounds were permitted and executed
    assert len(client.calls) == MAX_ROUNDS


@pytest.mark.asyncio
async def test_oversized_tool_output_truncated():
    """Oversized tool output is truncated to MAX_TOOL_OUTPUT_CHARS with an explicit indicator."""
    tool = FakeTool("verbose_tool")
    client = FakeMCPClient([tool])
    # 10,000 chars of output
    client.tool_handlers["verbose_tool"] = lambda args: FakeCallToolResult("A" * 10000)

    responses = [
        FakeModelResponse(function_calls=[types.FunctionCall(name="verbose_tool", args={})]),
        FakeModelResponse(text="Processed output."),
    ]
    llm = FakeLLMService(responses)

    reply = await run_agent("Give me lots of text", client=client, llm_service=llm)
    assert reply == "Processed output."

    user_turn = llm.calls[1]["contents"][-1]
    tool_resp_str = user_turn.parts[0].function_response.response["result"]
    assert len(tool_resp_str) < 10000
    assert "[Tool output truncated to limit]" in tool_resp_str
    assert tool_resp_str.startswith("A" * MAX_TOOL_OUTPUT_CHARS)


@pytest.mark.asyncio
async def test_tool_timeout_handled_safely():
    """A slow tool call triggers tool-level timeout and reports sanitized failure to model."""
    slow_tool = FakeTool("slow_tool")
    client = FakeMCPClient([slow_tool])

    async def slow_handler(args):
        await asyncio.sleep(1.0)
        return FakeCallToolResult("Finished")

    client.tool_handlers["slow_tool"] = slow_handler

    responses = [
        FakeModelResponse(function_calls=[types.FunctionCall(name="slow_tool", args={})]),
        FakeModelResponse(text="Handled slow tool."),
    ]
    llm = FakeLLMService(responses)

    # Monkeypatch DEFAULT_TOOL_TIMEOUT for fast testing
    from services import agent
    orig_timeout = agent.DEFAULT_TOOL_TIMEOUT
    agent.DEFAULT_TOOL_TIMEOUT = 0.05
    try:
        reply = await run_agent("Test tool timeout", client=client, llm_service=llm)
        assert reply == "Handled slow tool."
        user_turn = llm.calls[1]["contents"][-1]
        err_msg = user_turn.parts[0].function_response.response["error"]
        assert "execution timed out" in err_msg
    finally:
        agent.DEFAULT_TOOL_TIMEOUT = orig_timeout


@pytest.mark.asyncio
async def test_overall_agent_timeout_handled():
    """When the entire agent loop exceeds timeout, TIMEOUT_MESSAGE is returned."""
    tool = FakeTool("tool")
    client = FakeMCPClient([tool])

    class StallingLLM:
        def __init__(self):
            self.model = "m"
            class FakeClient:
                class FakeAio:
                    class FakeModels:
                        async def generate_content(self, *args, **kwargs):
                            await asyncio.sleep(1.0)
                            return FakeModelResponse(text="Never returned")
                    models = FakeModels()
                aio = FakeAio()
            self.client = FakeClient()

    reply = await run_agent("Timeout test", client=client, llm_service=StallingLLM(), timeout=0.05)
    assert reply == TIMEOUT_MESSAGE


@pytest.mark.asyncio
async def test_malformed_function_call_handled_without_crashing():
    """Verify that a malformed function call (None args or missing name) is handled without crashing."""
    calc_tool = FakeTool("calc", input_schema={"type": "object", "properties": {"x": {"type": "integer"}}})
    client = FakeMCPClient([calc_tool])

    # Model produces a function call with None args
    responses = [
        FakeModelResponse(function_calls=[types.FunctionCall(name="calc", args=None)]),
        FakeModelResponse(text="Handled malformed call."),
    ]
    llm = FakeLLMService(responses)

    reply = await run_agent("Test malformed args", client=client, llm_service=llm)
    assert reply == "Handled malformed call."
