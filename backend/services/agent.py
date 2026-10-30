"""
CortexDesk — Agent Orchestration Service (Task 2.2.5)

Orchestrates multi-turn model interactions and dynamic tool execution using
the active MCP client and Google GenAI function-calling interface.
Enforces strict turn bounding (MAX_ROUNDS = 6), input schema validation,
sanitized error recovery, output truncation, and resource timeouts.
"""

import asyncio
import logging
import time
from typing import Any, Dict, List, Optional

from google.genai import types
import jsonschema

from config import get_settings
from services.llm import LLMService, llm
from services.mcp_client import MCPClient, mcp_client

logger = logging.getLogger("cortexdesk.agent")

# Bounded iteration and resource constants
MAX_ROUNDS = 6
DEFAULT_AGENT_TIMEOUT = 60.0
DEFAULT_TOOL_TIMEOUT = 15.0
MAX_TOOL_OUTPUT_CHARS = 4000

MAX_ROUNDS_EXHAUSTED_MESSAGE = (
    "I've reached the maximum number of tool steps without completing the task. "
    "Please refine your query or try breaking it down into smaller steps."
)
TIMEOUT_MESSAGE = (
    "The operation timed out while processing tools. Please try again with a more specific request."
)
ERROR_MESSAGE = (
    "I encountered an error while processing your request. Please try again shortly."
)

SUPPORTED_SCHEMA_TYPES = {
    "string",
    "integer",
    "number",
    "boolean",
    "array",
    "object",
}


def sanitize_tool_args_for_logging(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Sanitizes and bounds tool arguments for privacy-safe operational logging.
    - Never logs complete search queries: truncates queries and logs query length.
    - Redacts sensitive keys (e.g. key, token, secret, auth, password, credential).
    - Bounds string values to max 30 characters.
    """
    sanitized: Dict[str, Any] = {}
    for k, v in (args or {}).items():
        k_lower = str(k).lower()
        if any(secret_word in k_lower for secret_word in ("key", "token", "secret", "auth", "password", "credential")):
            sanitized[k] = "[REDACTED]"
        elif tool_name == "web_search" and k == "query":
            if isinstance(v, str):
                truncated = v[:15] + "..." if len(v) > 15 else v
                sanitized[k] = f"{truncated} (len={len(v)})"
            else:
                sanitized[k] = str(v)[:20]
        elif isinstance(v, str):
            sanitized[k] = v[:30] + "..." if len(v) > 30 else v
        elif isinstance(v, (int, float, bool)):
            sanitized[k] = v
        else:
            sanitized[k] = f"<{type(v).__name__}>"
    return sanitized


def validate_mcp_tool_schema(name: str, schema: Any) -> Dict[str, Any]:
    """
    Validates that an MCP tool's inputSchema adheres to the provider's supported subset:
    - Must be a dictionary.
    - Top-level 'type' must be 'object'.
    - If 'properties' is present, it must be a dictionary.
    - Each property definition must specify a supported type.
    - If 'required' is present, it must be a list of strings matching property keys.

    Raises ValueError on unsupported or invalid schemas to prevent weakened validation.
    """
    if not isinstance(schema, dict):
        raise ValueError(
            f"Unsupported schema for tool '{name}': top-level schema must be a dictionary."
        )

    schema_type = schema.get("type")
    if schema_type != "object":
        raise ValueError(
            f"Unsupported schema for tool '{name}': root type must be 'object', got '{schema_type}'."
        )

    properties = schema.get("properties")
    if properties is not None and not isinstance(properties, dict):
        raise ValueError(
            f"Unsupported schema for tool '{name}': 'properties' must be a dictionary."
        )

    if properties:
        for prop_name, prop_def in properties.items():
            if not isinstance(prop_def, dict):
                raise ValueError(
                    f"Unsupported schema for tool '{name}', property '{prop_name}': must be a dictionary."
                )
            prop_type = prop_def.get("type")
            if prop_type and prop_type not in SUPPORTED_SCHEMA_TYPES:
                raise ValueError(
                    f"Unsupported type '{prop_type}' in tool '{name}' for property '{prop_name}'."
                )

    required = schema.get("required")
    if required is not None:
        if not isinstance(required, list) or not all(isinstance(r, str) for r in required):
            raise ValueError(
                f"Unsupported schema for tool '{name}': 'required' must be a list of strings."
            )

    return schema


def tool_declarations(client: Optional[Any] = None) -> List[types.FunctionDeclaration]:
    """
    Dynamically obtains tool definitions from the active MCP client and converts
    them into Google GenAI FunctionDeclarations.

    Preserves parameter types, required fields, and validates schemas strictly.
    Newly registered tools become available at runtime without host code changes.
    """
    c = client if client is not None else mcp_client
    tools_list = getattr(c, "tools", []) or []

    declarations: List[types.FunctionDeclaration] = []
    for tool in tools_list:
        tool_name = getattr(tool, "name", None)
        if not tool_name or not isinstance(tool_name, str):
            continue

        description = getattr(tool, "description", "") or ""
        raw_schema = (
            getattr(tool, "input_schema", None)
            or getattr(tool, "inputSchema", None)
            or {"type": "object", "properties": {}}
        )

        validated_schema = validate_mcp_tool_schema(tool_name, raw_schema)

        decl = types.FunctionDeclaration(
            name=tool_name,
            description=description,
            parameters_json_schema=validated_schema,
        )
        declarations.append(decl)

    return declarations


async def run_agent(
    prompt: str,
    system: Optional[str] = None,
    client: Optional[Any] = None,
    llm_service: Optional[Any] = None,
    max_rounds: int = MAX_ROUNDS,
    timeout: float = DEFAULT_AGENT_TIMEOUT,
) -> str:
    """
    Executes a bounded, secure tool-calling loop connecting the LLM with active MCP tools.

    Security & Safety Guarantees:
    - Temperature 0.0 for deterministic tool interactions.
    - Round limit strictly bounded to MAX_ROUNDS (6).
    - Unregistered tools and malformed arguments are intercepted and returned as sanitized tool errors.
    - Tool outputs are treated as untrusted and truncated at MAX_TOOL_OUTPUT_CHARS.
    - Subprocess/tool execution times and overall agent runtimes are bounded.
    - System instructions are preserved at the top level and cannot be overridden by tool results.
    """
    c = client if client is not None else mcp_client
    service = llm_service if llm_service is not None else llm

    declarations = tool_declarations(c)
    tools = [types.Tool(function_declarations=declarations)] if declarations else None

    sys_instruction = system.strip() if system and system.strip() else None

    # Disable SDK automatic function calling so the agent loop retains full control
    config = types.GenerateContentConfig(
        temperature=0.0,
        system_instruction=sys_instruction,
        tools=tools,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
    )

    contents: List[types.Content] = [
        types.Content(role="user", parts=[types.Part.from_text(text=prompt)])
    ]

    round_count = 0

    try:
        async with asyncio.timeout(timeout):
            while True:
                # 1. Query the model with conversation history and dynamic tools
                if hasattr(service, "generate_content"):
                    response = await service.generate_content(
                        contents=contents,
                        config=config,
                    )
                else:
                    response = await service.client.aio.models.generate_content(
                        model=service.model,
                        contents=contents,
                        config=config,
                    )

                # 2. Inspect for tool calling requests
                function_calls = getattr(response, "function_calls", None) or []
                if not function_calls:
                    # Model produced final answer without requesting further tools
                    try:
                        text = getattr(response, "text", "") or ""
                    except Exception:
                        text = ""
                    return text

                # 3. Check round limits before processing tool requests
                if round_count >= max_rounds:
                    logger.warning(
                        "Agent exceeded maximum tool rounds (%d). Terminating loop.",
                        max_rounds,
                    )
                    return MAX_ROUNDS_EXHAUSTED_MESSAGE

                round_count += 1
                logger.info(
                    "Executing agent tool round %d/%d (%d calls requested)",
                    round_count,
                    max_rounds,
                    len(function_calls),
                )

                # 4. Append model's turn to conversation history
                candidates = getattr(response, "candidates", None) or []
                if candidates and getattr(candidates[0], "content", None):
                    contents.append(candidates[0].content)
                else:
                    call_parts = [
                        types.Part.from_function_call(
                            name=fc.name,
                            args=dict(fc.args) if fc.args else {},
                        )
                        for fc in function_calls
                    ]
                    contents.append(types.Content(role="model", parts=call_parts))

                # 5. Process and execute each tool call
                response_parts: List[types.Part] = []
                for fc in function_calls:
                    name = fc.name
                    args = dict(fc.args) if fc.args else {}

                    sanitized_args = sanitize_tool_args_for_logging(name, args)

                    # Verify tool is registered
                    tool_def = next(
                        (t for t in getattr(c, "tools", []) if t.name == name),
                        None,
                    )
                    if not tool_def:
                        logger.warning(
                            "Tool invocation rejected: tool=%s status=failure reason=unknown_tool args=%s",
                            name,
                            sanitized_args,
                        )
                        response_parts.append(
                            types.Part.from_function_response(
                                name=name,
                                response={"error": f"Tool '{name}' is not recognized or available."},
                            )
                        )
                        continue

                    # Validate argument structure against declared JSON Schema
                    raw_schema = getattr(tool_def, "input_schema", None) or getattr(tool_def, "inputSchema", None)
                    if raw_schema:
                        try:
                            jsonschema.validate(instance=args, schema=raw_schema)
                        except jsonschema.ValidationError as val_err:
                            logger.warning(
                                "Tool invocation rejected: tool=%s status=failure reason=invalid_args args=%s error=%s",
                                name,
                                sanitized_args,
                                val_err.message,
                            )
                            response_parts.append(
                                types.Part.from_function_response(
                                    name=name,
                                    response={
                                        "error": f"Invalid arguments for tool '{name}': {val_err.message}"
                                    },
                                )
                            )
                            continue
                        except Exception as schema_err:
                            logger.warning(
                                "Tool invocation rejected: tool=%s status=failure reason=schema_error args=%s",
                                name,
                                sanitized_args,
                            )
                            response_parts.append(
                                types.Part.from_function_response(
                                    name=name,
                                    response={"error": "Invalid argument format."},
                                )
                            )
                            continue

                    # Execute tool via active MCP session with per-call timeout & duration tracking
                    tool_start_time = time.perf_counter()
                    try:
                        async with asyncio.timeout(DEFAULT_TOOL_TIMEOUT):
                            mcp_result = await c.call_tool(name, args)

                        duration_s = round(time.perf_counter() - tool_start_time, 4)

                        # Extract string content
                        items = getattr(mcp_result, "content", []) or []
                        output_str = "".join(
                            getattr(item, "text", str(item)) for item in items
                        )
                        is_error = getattr(mcp_result, "isError", False)
                        result_size = len(output_str)
                        success_classification = "failure" if is_error else "success"

                        # Log tool invocation metrics (never logs full prompts, results, or secrets)
                        logger.info(
                            "Tool invocation completed: tool=%s duration_s=%.4f result_size=%d status=%s args=%s",
                            name,
                            duration_s,
                            result_size,
                            success_classification,
                            sanitized_args,
                            extra={
                                "tool": name,
                                "duration_s": duration_s,
                                "result_size": result_size,
                                "status": success_classification,
                                "tool_args": sanitized_args,
                            },
                        )

                        # Truncate oversized output
                        if len(output_str) > MAX_TOOL_OUTPUT_CHARS:
                            output_str = (
                                output_str[:MAX_TOOL_OUTPUT_CHARS]
                                + "\n... [Tool output truncated to limit]"
                            )

                        if is_error:
                            tool_payload = {
                                "error": output_str or "Tool reported an execution error."
                            }
                        else:
                            tool_payload = {"result": output_str}

                    except asyncio.TimeoutError:
                        duration_s = round(time.perf_counter() - tool_start_time, 4)
                        logger.warning(
                            "Tool invocation timed out: tool=%s duration_s=%.4f status=failure args=%s",
                            name,
                            duration_s,
                            sanitized_args,
                            extra={
                                "tool": name,
                                "duration_s": duration_s,
                                "status": "failure",
                                "tool_args": sanitized_args,
                            },
                        )
                        tool_payload = {"error": f"Tool '{name}' execution timed out."}
                    except Exception as tool_exc:
                        duration_s = round(time.perf_counter() - tool_start_time, 4)
                        logger.warning(
                            "Tool invocation failed: tool=%s duration_s=%.4f status=failure error_type=%s args=%s",
                            name,
                            duration_s,
                            type(tool_exc).__name__,
                            sanitized_args,
                            extra={
                                "tool": name,
                                "duration_s": duration_s,
                                "status": "failure",
                                "error_type": type(tool_exc).__name__,
                                "tool_args": sanitized_args,
                            },
                        )
                        # Sanitized error report: never expose API keys, paths, or tracebacks
                        tool_payload = {
                            "error": f"Tool execution failed: {type(tool_exc).__name__}"
                        }

                    response_parts.append(
                        types.Part.from_function_response(name=name, response=tool_payload)
                    )

                # 6. Append tool responses as a user turn to feed back into the model
                contents.append(types.Content(role="user", parts=response_parts))

    except asyncio.TimeoutError:
        logger.warning("Agent execution exceeded total timeout of %ss", timeout)
        return TIMEOUT_MESSAGE
    except Exception as exc:
        logger.error("Agent loop encountered unhandled error: %s", type(exc).__name__)
        raise
