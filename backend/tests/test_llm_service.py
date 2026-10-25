"""
Unit tests for CortexDesk LLM Service abstraction (Story 2.1, Task 2.1.3).
Mocks the Google Gemini SDK client to verify retry behavior, streaming,
configuration mapping, and privacy-safe operational logging.
"""

import logging
from unittest.mock import AsyncMock, MagicMock
import pytest
from google.genai import errors, types

from config import Settings
from services.llm import LLMService, is_transient_error


class MockUsageMetadata:
    def __init__(self, prompt: int = 15, candidates: int = 25, total: int = 40):
        self.prompt_token_count = prompt
        self.candidates_token_count = candidates
        self.total_token_count = total


class MockResponse:
    def __init__(self, text: str = "Test response from Gemini", usage=None):
        self.text = text
        self.usage_metadata = usage or MockUsageMetadata()


class MockChunk:
    def __init__(self, text: str = "", usage=None):
        self.text = text
        self.usage_metadata = usage


def create_mock_client():
    mock_client = MagicMock()
    mock_client.aio = MagicMock()
    mock_client.aio.models = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock()
    mock_client.aio.models.generate_content_stream = AsyncMock()
    mock_client.aio.aclose = AsyncMock()
    return mock_client


@pytest.fixture
def mock_client():
    return create_mock_client()


@pytest.fixture
def test_settings():
    return Settings(
        _env_file=None,
        gemini_api_key="mock-gemini-key",
        llm_model="gemini-2.0-flash",
        embed_model="text-embedding-004",
        llm_temperature=0.3,
        llm_max_output_tokens=2048,
    )


@pytest.fixture
def llm_service(test_settings, mock_client):
    return LLMService(
        settings=test_settings,
        client=mock_client,
        retry_min_wait=0.001,
        retry_max_wait=0.005,
        max_attempts=3,
    )


def test_is_transient_error_classification():
    """Verify transient vs permanent error discrimination."""
    server_err = errors.ServerError(503, {"error": "backend overloaded"})
    rate_limit_err = errors.ClientError(429, {"error": "rate limit"})
    auth_err = errors.ClientError(401, {"error": "invalid api key"})
    not_found_err = errors.ClientError(404, {"error": "model not found"})
    bad_req_err = errors.ClientError(400, {"error": "bad request"})

    assert is_transient_error(server_err) is True
    assert is_transient_error(rate_limit_err) is True
    assert is_transient_error(auth_err) is False
    assert is_transient_error(not_found_err) is False
    assert is_transient_error(bad_req_err) is False
    assert is_transient_error(ValueError("local error")) is False


def test_config_construction(llm_service):
    """Verify _config constructs types.GenerateContentConfig accurately."""
    cfg = llm_service._config(
        temperature=0.7,
        max_output_tokens=1024,
        system="You are a helpful coding assistant.",
    )
    assert isinstance(cfg, types.GenerateContentConfig)
    assert cfg.temperature == 0.7
    assert cfg.max_output_tokens == 1024
    assert cfg.system_instruction == "You are a helpful coding assistant."

    # Verify defaults fallback
    default_cfg = llm_service._config()
    assert default_cfg.temperature == 0.3
    assert default_cfg.max_output_tokens == 2048
    assert default_cfg.system_instruction is None


@pytest.mark.asyncio
async def test_complete_success(llm_service, mock_client):
    """Verify complete() returns generated text and passes arguments."""
    mock_client.aio.models.generate_content.return_value = MockResponse(
        text="Hello world"
    )

    result = await llm_service.complete(
        prompt="Say hello", system="Be brief"
    )

    assert result == "Hello world"
    mock_client.aio.models.generate_content.assert_awaited_once()
    call_kwargs = mock_client.aio.models.generate_content.await_args.kwargs
    assert call_kwargs["model"] == "gemini-2.0-flash"
    assert call_kwargs["contents"] == "Say hello"
    assert call_kwargs["config"].system_instruction == "Be brief"


@pytest.mark.asyncio
async def test_complete_empty_response_returns_empty_string(llm_service, mock_client):
    """Verify complete() returns empty string when provider response text is None or empty."""
    mock_client.aio.models.generate_content.return_value = MockResponse(text=None)
    result = await llm_service.complete(prompt="Generate empty")
    assert result == ""

    mock_client.aio.models.generate_content.return_value = MockResponse(text="")
    result2 = await llm_service.complete(prompt="Generate empty string")
    assert result2 == ""


@pytest.mark.asyncio
async def test_complete_retries_transient_error_and_succeeds(llm_service, mock_client):
    """Verify that a transient 503 ServerError triggers a retry and subsequently succeeds."""
    mock_client.aio.models.generate_content.side_effect = [
        errors.ServerError(503, {"error": "temporarily unavailable"}),
        MockResponse(text="Recovered after transient error"),
    ]

    result = await llm_service.complete(prompt="Retry test")

    assert result == "Recovered after transient error"
    assert mock_client.aio.models.generate_content.await_count == 2


@pytest.mark.asyncio
async def test_complete_does_not_retry_permanent_error(llm_service, mock_client):
    """Verify that permanent 401 ClientError fails immediately on first attempt."""
    mock_client.aio.models.generate_content.side_effect = errors.ClientError(
        401, {"error": "API key invalid"}
    )

    with pytest.raises(errors.ClientError) as exc_info:
        await llm_service.complete(prompt="Test auth failure")

    assert exc_info.value.code == 401
    assert mock_client.aio.models.generate_content.await_count == 1


@pytest.mark.asyncio
async def test_complete_exhausts_max_retries(llm_service, mock_client):
    """Verify complete() halts and raises after exceeding max retries."""
    mock_client.aio.models.generate_content.side_effect = errors.ServerError(
        500, {"error": "internal error"}
    )

    with pytest.raises(errors.ServerError):
        await llm_service.complete(prompt="Failing repeatedly")

    assert mock_client.aio.models.generate_content.await_count == 3


@pytest.mark.asyncio
async def test_stream_yields_chunks_in_order(llm_service, mock_client):
    """Verify stream() yields non-empty chunks in order without buffering."""
    async def mock_stream_generator():
        yield MockChunk("Chunk 1 ")
        yield MockChunk("")  # Empty chunk, must be omitted
        yield MockChunk("Chunk 2 ")
        yield MockChunk("Chunk 3", usage=MockUsageMetadata(10, 20, 30))

    mock_client.aio.models.generate_content_stream.return_value = mock_stream_generator()

    collected = []
    async for chunk in llm_service.stream(prompt="Stream me"):
        collected.append(chunk)

    assert collected == ["Chunk 1 ", "Chunk 2 ", "Chunk 3"]
    assert "".join(collected) == "Chunk 1 Chunk 2 Chunk 3"


@pytest.mark.asyncio
async def test_stream_failure_propagates_without_silent_duplicate(llm_service, mock_client):
    """Verify stream failure propagates directly without duplicating chunks."""
    async def failing_stream_generator():
        yield MockChunk("First chunk")
        raise errors.ServerError(500, {"error": "stream crashed mid-way"})

    mock_client.aio.models.generate_content_stream.return_value = failing_stream_generator()

    yielded = []
    with pytest.raises(errors.ServerError):
        async for chunk in llm_service.stream(prompt="Stream with crash"):
            yielded.append(chunk)

    assert yielded == ["First chunk"]


@pytest.mark.asyncio
async def test_operational_logging_without_sensitive_leak(llm_service, mock_client, caplog):
    """Verify operational logging records model and token counts without leaking prompts or secrets."""
    mock_client.aio.models.generate_content.return_value = MockResponse(
        text="Classified response content"
    )

    with caplog.at_level(logging.INFO):
        sensitive_prompt = "TOP_SECRET_PROMPT_12345"
        await llm_service.complete(prompt=sensitive_prompt)

    log_text = caplog.text
    # Sensitive contents must NOT appear in log output
    assert sensitive_prompt not in log_text
    assert "Classified response content" not in log_text
    assert "mock-gemini-key" not in log_text

    # Operational metadata must appear
    assert "gemini-2.0-flash" in log_text
    assert "duration_s=" in log_text
    assert "prompt_tokens=15" in log_text
    assert "output_tokens=25" in log_text


@pytest.mark.asyncio
async def test_client_lifecycle_cleanup(llm_service, mock_client):
    """Verify aclose() closes async client session cleanly."""
    await llm_service.aclose()
    mock_client.aio.aclose.assert_awaited_once()
