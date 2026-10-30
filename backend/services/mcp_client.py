"""
CortexDesk — Shared MCPClient Service & Process Lifecycle (Task 2.2.4)

Provides an asynchronous client connecting the FastAPI backend to the standalone
MCP server ('WorkspaceTools') over standard input/output (stdio) transport.
Manages connection lifecycle, thread-safe tool execution, and resource cleanup.
"""

import asyncio
from contextlib import AsyncExitStack
import logging
import os
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Log diagnostics exclusively to stderr or application logger
logger = logging.getLogger("cortexdesk.mcp_client")

BACKEND_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SERVER_PATH = BACKEND_DIR / "mcp_server.py"
DEFAULT_TIMEOUT_SECONDS = 30.0


class MCPClient:
    """
    Shared client managing the lifecycle of an MCP server process over stdio.
    Maintains a single session reused across concurrent request handlers.
    """

    def __init__(
        self,
        server_path: Optional[Path] = None,
        python_executable: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.server_path = server_path or DEFAULT_SERVER_PATH
        self.python_executable = python_executable or sys.executable
        self.timeout = timeout
        self._stack: Optional[AsyncExitStack] = None
        self._session: Optional[ClientSession] = None
        self._lock = asyncio.Lock()
        self._tools: Dict[str, Any] = {}

    @property
    def is_connected(self) -> bool:
        """Returns True if the MCP session is currently active and initialized."""
        return self._session is not None and self._stack is not None

    @property
    def tools(self) -> List[Any]:
        """Returns the list of discovered MCP tool metadata objects."""
        return list(self._tools.values())

    @property
    def tool_names(self) -> List[str]:
        """Returns the names of all discovered tools."""
        return list(self._tools.keys())

    async def start(self) -> None:
        """
        Launches the MCP server subprocess, initializes the JSON-RPC session,
        and discovers available tools. Fails fast with clean teardown on error.
        """
        if self.is_connected:
            logger.info("MCPClient is already connected; skipping startup.")
            return

        if not self.server_path.is_file():
            err_msg = f"MCP server script not found at {self.server_path}"
            logger.error(err_msg)
            raise FileNotFoundError(err_msg)

        logger.info(
            "Starting MCPClient connection to server script: %s (using %s)",
            self.server_path.name,
            self.python_executable,
        )

        env = dict(os.environ)
        env["PYTHONUNBUFFERED"] = "1"
        params = StdioServerParameters(
            command=self.python_executable,
            args=["-u", str(self.server_path)],
            env=env,
            cwd=str(self.server_path.parent),
        )

        stack = AsyncExitStack()
        try:
            async with asyncio.timeout(self.timeout):
                # 1. Establish stdio process transport
                read_stream, write_stream = await stack.enter_async_context(stdio_client(params))

                # 2. Establish MCP ClientSession
                session = await stack.enter_async_context(ClientSession(read_stream, write_stream))

                # 3. Initialize protocol handshake
                init_result = await session.initialize()
                server_name = getattr(init_result.server_info, "name", "UnknownServer")

                # 4. Discover tools
                tools_response = await session.list_tools()
                discovered_tools = {tool.name: tool for tool in tools_response.tools}

                # 5. Commit state on success
                self._stack = stack
                self._session = session
                self._tools = discovered_tools

                logger.info(
                    "MCPClient successfully initialized with server %r. Discovered %d tools: %s",
                    server_name,
                    len(self._tools),
                    ", ".join(self._tools.keys()),
                )
        except Exception as exc:
            logger.error("Failed to initialize MCPClient: %s", type(exc).__name__)
            try:
                await stack.aclose()
            except Exception as close_exc:
                logger.warning("Error during MCPClient emergency stack cleanup: %s", close_exc)
            self._stack = None
            self._session = None
            self._tools = {}
            raise RuntimeError(f"MCPClient connection failed: {type(exc).__name__}") from exc

    async def stop(self) -> None:
        """
        Closes the active MCP session, terminates the child process, and releases
        all transport and stream resources without leaving orphaned processes.
        """
        async with self._lock:
            if self._stack is not None:
                logger.info("Stopping MCPClient and closing subprocess transport...")
                try:
                    await self._stack.aclose()
                except Exception as exc:
                    logger.warning("Error during MCPClient shutdown: %s", exc)
                finally:
                    self._stack = None
                    self._session = None
                    self._tools = {}
                logger.info("MCPClient stopped cleanly.")

    async def call_tool(
        self,
        name: str,
        arguments: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """
        Invokes an MCP tool on the active session with thread-safe serialization.
        """
        if not self.is_connected or self._session is None:
            raise RuntimeError("MCPClient is not connected. Call start() before calling tools.")

        if name not in self._tools:
            raise KeyError(f"Tool {name!r} is not registered on the MCP server.")

        async with self._lock:
            async with asyncio.timeout(self.timeout):
                return await self._session.call_tool(name, arguments or {})

    async def list_tools(self) -> List[Any]:
        """
        Queries the active session for tools and updates internal metadata.
        """
        if not self.is_connected or self._session is None:
            raise RuntimeError("MCPClient is not connected. Call start() before querying tools.")

        async with self._lock:
            async with asyncio.timeout(self.timeout):
                tools_response = await self._session.list_tools()
                self._tools = {tool.name: tool for tool in tools_response.tools}
                return list(self._tools.values())


# Shared singleton client instance
mcp_client = MCPClient()
