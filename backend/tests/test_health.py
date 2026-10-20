import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app

client = TestClient(app)


def test_health_endpoint_status_and_body():
    """Verify that GET /health returns 200 OK with {'status': 'ok'}."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


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
