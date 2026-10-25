import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app

client = TestClient(app)


def test_health_endpoint_status_and_body():
    """Verify that GET /health returns 200 OK with exact JSON body {'status': 'ok'}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_endpoint_accessible_without_authentication():
    """
    Verify that GET /health remains publicly accessible without an Authorization header,
    and does not reject requests with arbitrary or absent credentials.
    """
    # 1. Without Authorization header
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    # 2. Even with arbitrary Authorization header, health remains accessible
    response_with_header = client.get("/health", headers={"Authorization": "Bearer random-token"})
    assert response_with_header.status_code == 200
    assert response_with_header.json() == {"status": "ok"}


def test_unauthenticated_me_returns_401():
    """
    Verify that GET /me without an Authorization header is rejected with HTTP 401 Unauthorized,
    enforcing authentication without requiring network access or external Supabase connectivity.
    """
    response = client.get("/me")
    assert response.status_code == 401
    assert response.headers.get("www-authenticate") == "Bearer"
    assert response.json() == {"detail": "Missing Authorization header"}


def test_cors_allowed_origin():
    """Verify that requests from an allowed origin receive CORS authorization headers."""
    response = client.get(
        "/health",
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_preflight_allowed_origin():
    """Verify OPTIONS preflight request from allowed origin."""
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert response.headers.get("access-control-allow-credentials") == "true"


def test_cors_disallowed_origin():
    """Verify that requests from unauthorized origins do not receive CORS allow headers."""
    response = client.get(
        "/health",
        headers={"Origin": "https://unauthorized-domain.com"},
    )
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers
