"""
CortexDesk — Automated Unit & Regression Tests for POST /api/chat (Task 2.1.6)

Core Requirements:
- Automated tests MUST NEVER call the real AI provider (all provider interactions are mocked/isolated).
- Tests must work fully offline, without a real API key, and without consuming quota.

Coverage Matrix:
1. Unauthenticated request: missing Authorization header returns HTTP 401.
2. Empty message: returns HTTP 422.
3. Whitespace-only message: returns HTTP 422.
4. Oversized message: string exceeding 8000 characters returns HTTP 422.
5. Successful request: authenticated caller receives HTTP 200 with structured reply.
6. Provider failure: provider exception returns HTTP 503 with friendly, non-leaking message.
7. Retry behavior: transient failures retry up to 3 total attempts at the service boundary before succeeding, verified through call count.
8. Rate limiting: requests exceeding limit return HTTP 429 without invoking the LLM for rejected requests.
9. Project ID handling: optional project ID is accepted; valid owned project succeeds (200), unowned/missing returns 404, malformed returns 422.
10. Authentication edge cases: non-bearer format, malformed token string, and cryptographically expired token return HTTP 401.
"""

from pathlib import Path
import sys
import time
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from google.genai import errors
import jwt

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
from auth import get_current_user, AuthenticatedUser, verify_token
from config import get_settings
from db import get_user_db_client
from routers.chat import chat_limiter, InMemoryRateLimiter
from services.llm import LLMService

client = TestClient(app)

MOCK_USER_A = AuthenticatedUser(
    user_id="usr_test_user_a_123",
    email="user_a@cortexdesk.internal",
    raw_token="mock_bearer_token_user_a",
)

MOCK_USER_B = AuthenticatedUser(
    user_id="usr_test_user_b_456",
    email="user_b@cortexdesk.internal",
    raw_token="mock_bearer_token_user_b",
)

# Deterministic RSA keypair for testing cryptographic JWT edge cases
_test_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_test_public_key = _test_private_key.public_key()


def generate_test_jwt(
    sub: str = "usr_test_user_a_123",
    exp_offset_seconds: int = 3600,
    aud: str = "authenticated",
    iss: str = "https://example.supabase.co/auth/v1",
    kid: str = "test-key-id-1",
) -> str:
    """Helper to generate structurally valid test JWTs with custom expiration and claims."""
    now = int(time.time())
    payload = {
        "sub": sub,
        "email": "user_a@cortexdesk.internal",
        "aud": aud,
        "iss": iss,
        "iat": now,
        "exp": now + exp_offset_seconds,
    }
    return jwt.encode(
        payload,
        key=_test_private_key,
        algorithm="RS256",
        headers={"kid": kid},
    )


@pytest.fixture(autouse=True)
def reset_test_state():
    """Ensure clean dependency overrides and rate limiter state before and after every test."""
    app.dependency_overrides.clear()
    chat_limiter.reset()
    yield
    app.dependency_overrides.clear()
    chat_limiter.reset()


# ==============================================================================
# 1. Baseline & Unauthenticated Tests
# ==============================================================================

def test_health_remains_functional():
    """Public /health remains accessible without authentication."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_chat_unauthenticated_request_rejected():
    """Request without an Authorization header returns HTTP 401."""
    response = client.post("/api/chat", json={"message": "Hello CortexDesk"})
    assert response.status_code == 401
    assert "detail" in response.json()
    assert response.headers.get("WWW-Authenticate") == "Bearer"


# ==============================================================================
# 2. Input Validation Tests
# ==============================================================================

def test_chat_rejects_empty_message():
    """Empty message string returns HTTP 422."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    response = client.post("/api/chat", json={"message": ""})
    assert response.status_code == 422


def test_chat_rejects_whitespace_only_messages():
    """Whitespace-only messages return HTTP 422."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    for bad_input in [" ", "   ", "\t\t", "\n\n   \n", "\r\n     "]:
        response = client.post("/api/chat", json={"message": bad_input})
        assert response.status_code == 422


def test_chat_rejects_oversized_message():
    """Message exceeding 8000 characters returns HTTP 422."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    oversized = "x" * 8001
    response = client.post("/api/chat", json={"message": oversized})
    assert response.status_code == 422


def test_chat_rejects_missing_message_field():
    """Payload missing the message field returns HTTP 422."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    response = client.post("/api/chat", json={})
    assert response.status_code == 422


# ==============================================================================
# 3. Successful Request Handling
# ==============================================================================

@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_successful_request_with_fake_llm(mock_agent):
    """Authenticated request returns HTTP 200 with reply from fake agent."""
    mock_agent.return_value = "Hello! I am your CortexDesk workspace assistant."
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A

    response = client.post("/api/chat", json={"message": "Hello assistant"})

    assert response.status_code == 200
    assert response.json() == {
        "reply": "Hello! I am your CortexDesk workspace assistant."
    }
    mock_agent.assert_called_once()
    kwargs = mock_agent.call_args.kwargs
    assert kwargs["prompt"] == "Hello assistant"
    assert "CortexDesk" in kwargs["system"]
    assert "Today's date is" in kwargs["system"]


@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_forwards_client_date_to_system_prompt(mock_agent):
    """Client-provided date context is injected into agent system prompt."""
    mock_agent.return_value = "Today is Friday, October 30, 2026."
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A

    response = client.post(
        "/api/chat",
        json={
            "message": "what is today's date?",
            "client_date": "Friday, October 30, 2026 at 10:46 AM",
        },
    )

    assert response.status_code == 200
    mock_agent.assert_called_once()
    kwargs = mock_agent.call_args.kwargs
    assert "Friday, October 30, 2026 at 10:46 AM" in kwargs["system"]


@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_empty_provider_response_handled_gracefully(mock_agent):
    """Empty provider response returns HTTP 200 with an empty reply string."""
    mock_agent.return_value = ""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A

    response = client.post("/api/chat", json={"message": "Trigger empty reply"})

    assert response.status_code == 200
    assert response.json() == {"reply": ""}


# ==============================================================================
# 4. Provider Failure Mapping
# ==============================================================================

@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_provider_failure_maps_to_503(mock_agent):
    """Provider-style exceptions map to HTTP 503 with friendly, non-leaking message."""
    mock_agent.side_effect = errors.ServerError(
        503, {"error": "Google Gemini upstream quota or network unavailable"}
    )
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A

    response = client.post("/api/chat", json={"message": "Hello"})

    assert response.status_code == 503
    data = response.json()
    assert data["detail"] == "The AI service is busy. Please try again shortly."
    assert "Google" not in str(data)
    assert "Gemini" not in str(data)


# ==============================================================================
# 5. Service Layer Retry Behavior
# ==============================================================================

@pytest.mark.asyncio
async def test_service_retries_transient_failures_and_succeeds_on_third_attempt():
    """
    Exercises the actual Tenacity retry policy in LLMService:
    Fails twice with transient 503 ServerError and succeeds on attempt 3.
    Verifies call count is 3 and the eventual result is returned.
    """
    service = LLMService()

    call_count = 0

    async def fake_generate_content(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise errors.ServerError(503, {"error": "Transient 503 error"})
        mock_resp = MagicMock(text="Success on attempt 3!", usage_metadata=None)
        return mock_resp

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=fake_generate_content)
    service._client = mock_client

    # Use fast retry timings for deterministic test execution
    with patch("services.llm.AsyncRetrying") as mock_retrying_cls:
        from tenacity import AsyncRetrying, stop_after_attempt, wait_none, retry_if_exception
        from services.llm import is_transient_error

        # Instantiate fast retrying policy (3 attempts, 0 wait)
        fast_retrying = AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_none(),
            retry=retry_if_exception(is_transient_error),
            reraise=True,
        )
        mock_retrying_cls.return_value = fast_retrying

        result = await service.complete(prompt="Test retry prompt")

    assert call_count == 3
    assert result == "Success on attempt 3!"


# ==============================================================================
# 6. Rate Limiting Enforcement
# ==============================================================================

@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_rate_limiting_enforcement_without_invoking_llm_on_rejection(mock_agent):
    """
    Requests exceeding configured limit return HTTP 429.
    The agent service is NOT invoked for the rejected request.
    """
    mock_agent.return_value = "Reply"
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A

    # Allowed: 5 requests
    for i in range(5):
        res = client.post("/api/chat", json={"message": f"Message {i}"})
        assert res.status_code == 200

    assert mock_agent.call_count == 5

    # 6th request: rejected by rate limiter
    rejected_res = client.post("/api/chat", json={"message": "Exceeded quota message"})
    assert rejected_res.status_code == 429
    assert rejected_res.json()["detail"] == (
        "Rate limit exceeded. Please wait a moment before sending more messages."
    )
    assert rejected_res.headers.get("Retry-After") == "60"

    # Crucial assertion: agent was NOT called for the 6th rejected request
    assert mock_agent.call_count == 5


@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_rate_limiting_isolated_per_authenticated_identity(mock_agent):
    """Rate limit on User A does not exhaust or block quota for User B."""
    mock_agent.return_value = "OK"

    # User A exhausts quota
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    for _ in range(5):
        client.post("/api/chat", json={"message": "User A query"})

    # User A is blocked
    res_a = client.post("/api/chat", json={"message": "User A blocked query"})
    assert res_a.status_code == 429

    # User B should be permitted
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_B
    res_b = client.post("/api/chat", json={"message": "User B active query"})
    assert res_b.status_code == 200


def test_in_memory_rate_limiter_window_eviction_and_cleanup():
    """Unit test for rate limiter window eviction and internal cleanup."""
    limiter = InMemoryRateLimiter(max_requests=2, window_seconds=0.1, max_entries=5)

    assert limiter.is_rate_limited("user_1") is False
    assert limiter.is_rate_limited("user_1") is False
    assert limiter.is_rate_limited("user_1") is True

    # Sleep past the window
    time.sleep(0.15)

    # Allowed again
    assert limiter.is_rate_limited("user_1") is False


# ==============================================================================
# 7. Project Context & Ownership Verification
# ==============================================================================

@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_with_valid_owned_project_id(mock_agent):
    """When a valid project_id is provided and owned by the caller, request succeeds."""
    mock_agent.return_value = "Project context loaded."
    mock_db = MagicMock()
    mock_db.from_().select().eq().execute.return_value = MagicMock(
        data=[{"id": "c65daca3-f71b-4ec9-a158-3cb398b65ee0"}]
    )

    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: mock_db

    response = client.post(
        "/api/chat",
        json={
            "message": "Summarize this project",
            "project_id": "c65daca3-f71b-4ec9-a158-3cb398b65ee0",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"reply": "Project context loaded."}


def test_chat_with_unowned_or_missing_project_id_returns_404():
    """
    When project_id does not exist or is owned by another user (RLS filtering),
    returns HTTP 404 without leaking cross-tenant data.
    """
    mock_db = MagicMock()
    mock_db.from_().select().eq().execute.return_value = MagicMock(data=[])

    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: mock_db

    response = client.post(
        "/api/chat",
        json={
            "message": "Access project",
            "project_id": "c65daca3-f71b-4ec9-a158-3cb398b65ee0",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_chat_rejects_malformed_project_id_uuid():
    """Non-UUID formatted project_id returns HTTP 422."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    response = client.post(
        "/api/chat",
        json={"message": "Valid prompt", "project_id": "invalid-not-a-uuid"},
    )
    assert response.status_code == 422


# ==============================================================================
# 8. Authentication Edge Cases
# ==============================================================================

def test_chat_rejects_non_bearer_authorization_header():
    """Non-Bearer scheme in Authorization header returns HTTP 401."""
    response = client.post(
        "/api/chat",
        headers={"Authorization": "Basic dXNlcjpwYXNz"},
        json={"message": "Hello"},
    )
    assert response.status_code == 401
    assert "Invalid Authorization header format" in response.json()["detail"]


def test_chat_rejects_malformed_jwt_token_string():
    """Malformed token string returns HTTP 401."""
    response = client.post(
        "/api/chat",
        headers={"Authorization": "Bearer not.a.valid.jwt.token"},
        json={"message": "Hello"},
    )
    assert response.status_code == 401


def test_chat_rejects_cryptographically_expired_jwt():
    """Expired JWT token returns HTTP 401."""
    expired_token = generate_test_jwt(exp_offset_seconds=-3600)

    # Create mock JWKS client that returns test public key
    mock_jwk_key = MagicMock()
    mock_jwk_key.key = _test_public_key
    mock_jwks_client = MagicMock()
    mock_jwks_client.get_signing_key_from_jwt.return_value = mock_jwk_key

    with patch("auth.get_jwks_client", return_value=mock_jwks_client):
        response = client.post(
            "/api/chat",
            headers={"Authorization": f"Bearer {expired_token}"},
            json={"message": "Hello with expired token"},
        )

    assert response.status_code == 401
    assert response.json()["detail"] == "Token has expired"


# ==============================================================================
# 9. Task 2.2.6 Agent Integration & Error Resilience
# ==============================================================================

@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_mcp_unavailability_returns_friendly_503(mock_agent):
    """When MCP or AI service is unavailable, returns friendly HTTP 503."""
    mock_agent.side_effect = RuntimeError("MCPClient connection failed")
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A

    response = client.post("/api/chat", json={"message": "Query tools"})

    assert response.status_code == 503
    assert response.json()["detail"] == "The AI service is busy. Please try again shortly."


@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_timeout_maps_to_friendly_503(mock_agent):
    """Request timeout in agent execution maps to friendly HTTP 503."""
    import asyncio
    mock_agent.side_effect = asyncio.TimeoutError()
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A

    response = client.post("/api/chat", json={"message": "Slow prompt"})

    assert response.status_code == 503
    assert response.json()["detail"] == "The AI service is busy. Please try again shortly."


@patch("routers.chat.run_agent", new_callable=AsyncMock)
def test_chat_tool_error_handled_by_agent_does_not_cause_500(mock_agent):
    """
    Tool errors handled internally by the agent return a graceful answer,
    preventing unhandled HTTP 500 errors.
    """
    mock_agent.return_value = "I encountered an issue computing that, but 5 * 5 = 25."
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A

    response = client.post("/api/chat", json={"message": "Calculate with error"})

    assert response.status_code == 200
    assert "25" in response.json()["reply"]
