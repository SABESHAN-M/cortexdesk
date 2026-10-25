"""
CortexDesk — Authentication Regression Tests

Validates:
1. Request without an Authorization header returns HTTP 401.
2. Request with a malformed bearer token returns HTTP 401.
3. Request with a tampered or invalidly signed token returns HTTP 401.
4. Request with an expired token returns HTTP 401.
5. Request with an incorrect audience or issuer returns HTTP 401.
6. A valid test-signed token with expected claims authenticates successfully (HTTP 200)
   and returns the expected user ID and email without leaking tokens.
7. /health remains accessible without an authentication token (HTTP 200).
8. JWKS retrieval and caching behavior with bounded timeouts and lifespan.
"""

import time
import sys
from pathlib import Path
from unittest.mock import MagicMock
import pytest
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
from config import get_settings
from auth import verify_token, get_jwks_client

client = TestClient(app)

# Generate deterministic RSA test keys for cryptographic verification
_test_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_test_public_key = _test_private_key.public_key()

_tampered_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def create_test_token(
    sub: str = "usr_authenticated_12345",
    email: str = "testuser@cortexdesk.internal",
    aud: str = "authenticated",
    iss: str = "https://example.supabase.co/auth/v1",
    exp_offset: int = 3600,
    signing_key=_test_private_key,
    headers=None,
    omit_sub: bool = False,
) -> str:
    now = int(time.time())
    payload = {
        "aud": aud,
        "iss": iss,
        "iat": now,
        "exp": now + exp_offset,
    }
    if not omit_sub:
        payload["sub"] = sub
    if email is not None:
        payload["email"] = email

    token_headers = {"kid": "cortexdesk-test-key", "alg": "RS256"}
    if headers:
        token_headers.update(headers)

    return jwt.encode(payload, signing_key, algorithm="RS256", headers=token_headers)


@pytest.fixture
def mock_jwks_client(monkeypatch):
    """
    Safely mocks the JWKS retrieval client to supply the test public key
    without contacting real Supabase networks or external endpoints.
    State is automatically restored between tests.
    """
    mock_client = MagicMock()
    mock_signing_key = MagicMock()
    mock_signing_key.key = _test_public_key
    mock_client.get_signing_key_from_jwt.return_value = mock_signing_key

    monkeypatch.setattr("auth.get_jwks_client", lambda url: mock_client)
    return mock_client


# ==============================================================================
# 1. Request without an Authorization header returns HTTP 401
# ==============================================================================
def test_1_request_without_auth_header_returns_401():
    """Verify requesting protected endpoint without Authorization header returns 401."""
    response = client.get("/me")
    assert response.status_code == 401
    assert "Missing Authorization header" in response.json()["detail"]
    assert response.headers.get("www-authenticate") == "Bearer"


# ==============================================================================
# 2. Request with a malformed bearer token returns HTTP 401
# ==============================================================================
def test_2_request_with_malformed_bearer_token_returns_401(mock_jwks_client):
    """Verify requesting with malformed header formats and non-JWT strings returns 401."""
    # Malformed header scheme
    res_basic = client.get("/me", headers={"Authorization": "Basic dXNlcjpwYXNz"})
    assert res_basic.status_code == 401

    # Missing token part
    res_empty_bearer = client.get("/me", headers={"Authorization": "Bearer "})
    assert res_empty_bearer.status_code == 401

    # Multiple parts
    res_multi = client.get("/me", headers={"Authorization": "Bearer part1 part2"})
    assert res_multi.status_code == 401

    # Corrupted / invalid JWT string
    res_garbage = client.get("/me", headers={"Authorization": "Bearer not-a-valid-jwt-token"})
    assert res_garbage.status_code == 401


# ==============================================================================
# 3. Request with a tampered or invalidly signed token returns HTTP 401
# ==============================================================================
def test_3_request_with_tampered_or_invalid_signature_returns_401(mock_jwks_client):
    """Verify tokens signed with an unauthorized private key or tampered payloads fail with 401."""
    settings = get_settings()

    # Token signed with untrusted / mismatched key
    tampered_token = create_test_token(
        aud=settings.supabase_jwt_audience,
        iss=settings.supabase_issuer,
        signing_key=_tampered_private_key,
    )

    response = client.get("/me", headers={"Authorization": f"Bearer {tampered_token}"})
    assert response.status_code == 401
    assert "Invalid token signature" in response.json()["detail"]


# ==============================================================================
# 4. Request with an expired token returns HTTP 401
# ==============================================================================
def test_4_request_with_expired_token_returns_401(mock_jwks_client):
    """Verify expired tokens are rejected with 401."""
    settings = get_settings()
    expired_token = create_test_token(
        aud=settings.supabase_jwt_audience,
        iss=settings.supabase_issuer,
        exp_offset=-120,  # Expired 2 minutes ago
    )

    response = client.get("/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401
    assert "Token has expired" in response.json()["detail"]


# ==============================================================================
# 5. Request with an incorrect audience or issuer returns HTTP 401
# ==============================================================================
def test_5_request_with_incorrect_audience_returns_401(mock_jwks_client):
    """Verify tokens containing an unauthorized audience claim return 401."""
    settings = get_settings()
    wrong_aud_token = create_test_token(
        aud="malicious-audience",
        iss=settings.supabase_issuer,
    )

    response = client.get("/me", headers={"Authorization": f"Bearer {wrong_aud_token}"})
    assert response.status_code == 401
    assert "Invalid token audience" in response.json()["detail"]


def test_5_request_with_incorrect_issuer_returns_401(mock_jwks_client):
    """Verify tokens from an untrusted issuer return 401."""
    settings = get_settings()
    wrong_iss_token = create_test_token(
        aud=settings.supabase_jwt_audience,
        iss="https://untrusted-supabase-project.supabase.co/auth/v1",
    )

    response = client.get("/me", headers={"Authorization": f"Bearer {wrong_iss_token}"})
    assert response.status_code == 401
    assert "Invalid token issuer" in response.json()["detail"]


# ==============================================================================
# 6. Valid test-signed token authenticates and returns user ID and email
# ==============================================================================
def test_6_valid_signed_token_authenticates_successfully(mock_jwks_client):
    """Verify a valid RS256 token returns 200 OK with expected user ID and email."""
    settings = get_settings()
    valid_token = create_test_token(
        sub="usr_cortexdesk_qa_user",
        email="qa-engineer@cortexdesk.internal",
        aud=settings.supabase_jwt_audience,
        iss=settings.supabase_issuer,
    )

    response = client.get("/me", headers={"Authorization": f"Bearer {valid_token}"})
    assert response.status_code == 200

    data = response.json()
    assert data["user_id"] == "usr_cortexdesk_qa_user"
    assert data["email"] == "qa-engineer@cortexdesk.internal"

    # Security check: Never expose raw access tokens in responses
    assert "raw_token" not in data


# ==============================================================================
# 7. /health remains accessible without a token
# ==============================================================================
def test_7_health_endpoint_remains_public():
    """Verify /health is accessible to unauthenticated monitoring agents."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ==============================================================================
# 8. JWKS retrieval and caching behavior
# ==============================================================================
def test_8_jwks_client_caching_and_bounded_parameters():
    """Verify PyJWKClient instance caching by URL, bounded timeout, and bounded lifespan."""
    url1 = "https://tenant-alpha.supabase.co/auth/v1/.well-known/jwks.json"
    url2 = "https://tenant-beta.supabase.co/auth/v1/.well-known/jwks.json"

    client1_a = get_jwks_client(url1)
    client1_b = get_jwks_client(url1)
    client2 = get_jwks_client(url2)

    assert client1_a is client1_b, "Identical JWKS URLs must return the cached PyJWKClient instance"
    assert client1_a is not client2, "Distinct JWKS URLs must return independent client instances"
    assert client1_a.timeout == 10.0, "JWKS client must enforce a bounded 10s network timeout"
    assert client1_a.jwk_set_cache.lifespan == 300.0, "JWKS client must cache keys for a bounded 5m lifespan"
