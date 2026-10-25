"""
Tests for shared MCPClient service and FastAPI lifespan integration (Task 2.2.4).
"""

import asyncio
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from services.mcp_client import MCPClient, mcp_client
from main import app


@pytest.mark.asyncio
async def test_mcp_client_lifecycle_and_tool_discovery():
    """
    Verify that MCPClient launches the server subprocess, connects over stdio,
    initializes the session, discovers tools, and cleans up completely on stop.
    """
    client = MCPClient()
    assert not client.is_connected

    try:
        await client.start()
        assert client.is_connected
        assert "calculate_expression" in client.tool_names
        assert "web_search" in client.tool_names
        assert len(client.tools) >= 2

        # Verify tool execution via active session
        result = await client.call_tool("calculate_expression", {"expression": "12 * 12"})
        assert result.content[0].text == "144"

        # Calling start() again should be a safe no-op
        await client.start()
        assert client.is_connected
    finally:
        await client.stop()

    assert not client.is_connected
    assert client.tools == []


@pytest.mark.asyncio
async def test_mcp_client_unregistered_tool_error():
    """Calling an unregistered tool should immediately raise KeyError without hanging."""
    client = MCPClient()
    try:
        await client.start()
        with pytest.raises(KeyError, match="not registered"):
            await client.call_tool("non_existent_tool", {})
    finally:
        await client.stop()


@pytest.mark.asyncio
async def test_mcp_client_not_connected_error():
    """Calling tools before start() or after stop() should raise RuntimeError."""
    client = MCPClient()
    with pytest.raises(RuntimeError, match="not connected"):
        await client.call_tool("calculate_expression", {"expression": "1+1"})

    with pytest.raises(RuntimeError, match="not connected"):
        await client.list_tools()


@pytest.mark.asyncio
async def test_mcp_client_concurrent_tool_execution():
    """
    Verify that concurrent calls are serialized cleanly via asyncio.Lock
    and all complete successfully without frame interleaving.
    """
    client = MCPClient()
    try:
        await client.start()

        expressions = [f"{i} + {i}" for i in range(1, 6)]
        tasks = [
            client.call_tool("calculate_expression", {"expression": expr})
            for expr in expressions
        ]

        results = await asyncio.gather(*tasks)
        expected = [str(i + i) for i in range(1, 6)]
        actual = [res.content[0].text for res in results]
        assert actual == expected
    finally:
        await client.stop()


@pytest.mark.asyncio
async def test_mcp_client_startup_failure_missing_file():
    """If the server script does not exist, startup fails clearly with FileNotFoundError."""
    invalid_path = Path("backend/does_not_exist_xyz.py")
    client = MCPClient(server_path=invalid_path)

    with pytest.raises(FileNotFoundError):
        await client.start()

    assert not client.is_connected
    assert client.tools == []


@pytest.mark.asyncio
async def test_mcp_client_startup_failure_invalid_executable():
    """If the python executable is invalid, startup aborts with RuntimeError and cleans up."""
    client = MCPClient(python_executable="non_existent_python_binary_xyz_123")

    with pytest.raises(RuntimeError, match="MCPClient connection failed"):
        await client.start()

    assert not client.is_connected
    assert client.tools == []


@pytest.mark.asyncio
async def test_mcp_client_startup_timeout_failure():
    """A bounded timeout aborts startup and cleans up when the handshake is too slow."""
    # Setting an unrealistically low timeout (0.000001s) forces a timeout
    client = MCPClient(timeout=0.000001)

    with pytest.raises(RuntimeError, match="MCPClient connection failed"):
        await client.start()

    assert not client.is_connected
    assert client.tools == []


def test_fastapi_lifespan_integration():
    """
    Verify that FastAPI's lifespan initializes the global mcp_client during startup,
    serves /health with 200 OK, and closes the mcp_client during shutdown.
    """
    # Use TestClient as a context manager to execute the application lifespan
    with TestClient(app) as test_client:
        # 1. Health check is healthy
        response = test_client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

        # 2. Global mcp_client is connected and tools are discovered
        assert mcp_client.is_connected
        assert "calculate_expression" in mcp_client.tool_names
        assert "web_search" in mcp_client.tool_names

    # 3. Upon application shutdown, mcp_client is cleanly stopped
    assert not mcp_client.is_connected


# ==============================================================================
# Mocked Process & Transport Boundary Unit Tests
# ==============================================================================

from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_mocked_mcp_client_successful_startup_and_discovery():
    """Verify startup and tool discovery with mocked transport and session boundaries."""
    client = MCPClient()

    mock_session = AsyncMock()
    mock_session.initialize.return_value = MagicMock(server_info=MagicMock(name="MockServer"))
    mock_tool = MagicMock(name="calculate_expression", description="Calc")
    mock_tool.name = "calculate_expression"
    mock_session.list_tools.return_value = MagicMock(tools=[mock_tool])

    with patch("services.mcp_client.stdio_client") as mock_stdio:
        mock_stdio.return_value.__aenter__.return_value = (AsyncMock(), AsyncMock())
        mock_stdio.return_value.__aexit__.return_value = None

        with patch("services.mcp_client.ClientSession") as mock_session_cls:
            mock_session_cls.return_value.__aenter__.return_value = mock_session
            mock_session_cls.return_value.__aexit__.return_value = None

            await client.start()
            assert client.is_connected
            assert "calculate_expression" in client.tool_names
            assert len(client.tools) == 1

            await client.stop()
            assert not client.is_connected
            assert client.tools == []


@pytest.mark.asyncio
async def test_mocked_mcp_client_partial_initialization_failure_cleans_up():
    """
    Verify that if transport connects but protocol handshake fails (partial initialization),
    emergency stack cleanup triggers, releasing transport streams and preventing orphaned processes.
    """
    client = MCPClient()

    mock_session = AsyncMock()
    # Handshake fails
    mock_session.initialize.side_effect = ConnectionResetError("Subprocess dropped connection")

    with patch("services.mcp_client.stdio_client") as mock_stdio:
        mock_transport_context = AsyncMock()
        mock_stdio.return_value = mock_transport_context
        mock_transport_context.__aenter__.return_value = (AsyncMock(), AsyncMock())
        mock_transport_context.__aexit__.return_value = None

        with patch("services.mcp_client.ClientSession") as mock_session_cls:
            mock_session_context = AsyncMock()
            mock_session_cls.return_value = mock_session_context
            mock_session_context.__aenter__.return_value = mock_session
            mock_session_context.__aexit__.return_value = None

            with pytest.raises(RuntimeError, match="MCPClient connection failed"):
                await client.start()

            # Verify cleanup was triggered
            assert not client.is_connected
            assert client.tools == []
            mock_transport_context.__aexit__.assert_called_once()
