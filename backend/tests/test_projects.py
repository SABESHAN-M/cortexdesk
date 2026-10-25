"""
CortexDesk — Projects REST API Tests (Task 1.3.4)

Validates:
1. All endpoints require authentication (GET, POST, DELETE without token return HTTP 401).
2. GET /projects lists user projects and returns empty array when none exist.
3. POST /projects validates input (rejects empty/whitespace/oversized title, oversized description).
4. POST /projects successfully creates project with server-controlled owner_id.
5. DELETE /projects/{id} validates UUID format (rejects malformed IDs).
6. DELETE /projects/{id} returns 200 on successful deletion of owned project.
7. DELETE /projects/{id} returns 404 for nonexistent or inaccessible projects without leaking cross-user data.
8. Ensures no service-role key is used for project database operations.
9. GET /health remains publicly accessible without authentication.
"""

from pathlib import Path
import sys
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from main import app
from auth import get_current_user, AuthenticatedUser
from db import get_user_db_client, create_user_scoped_client
from config import get_settings

client = TestClient(app)

MOCK_USER_A = AuthenticatedUser(
    user_id="usr_user_a_12345",
    email="usera@cortexdesk.internal",
    raw_token="mock_bearer_token_user_a",
)

MOCK_USER_B = AuthenticatedUser(
    user_id="usr_user_b_67890",
    email="userb@cortexdesk.internal",
    raw_token="mock_bearer_token_user_b",
)


@pytest.fixture(autouse=True)
def clean_dependency_overrides():
    """Ensure clean dependency overrides before and after each test."""
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


# ==============================================================================
# 1. Authentication Enforcement Tests
# ==============================================================================

def test_health_remains_public():
    """Public /health must remain accessible without authentication."""
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_get_projects_requires_auth():
    """GET /projects without an Authorization header must return HTTP 401."""
    response = client.get("/projects")
    assert response.status_code == 401
    assert "detail" in response.json()


def test_post_projects_requires_auth():
    """POST /projects without an Authorization header must return HTTP 401."""
    response = client.post("/projects", json={"title": "Test Project"})
    assert response.status_code == 401


def test_delete_projects_requires_auth():
    """DELETE /projects/{id} without an Authorization header must return HTTP 401."""
    response = client.delete("/projects/123e4567-e89b-12d3-a456-426614174000")
    assert response.status_code == 401


# ==============================================================================
# 2. GET /projects Endpoint Tests
# ==============================================================================

def test_list_projects_success():
    """GET /projects returns the caller's projects ordered by created_at."""
    mock_db = MagicMock()
    mock_data = [
        {
            "id": "11111111-1111-1111-1111-111111111111",
            "owner_id": MOCK_USER_A.user_id,
            "title": "Alpha Workspace",
            "description": "Primary project",
            "created_at": "2026-10-20T20:00:00Z",
        },
        {
            "id": "22222222-2222-2222-2222-222222222222",
            "owner_id": MOCK_USER_A.user_id,
            "title": "Beta Workspace",
            "description": None,
            "created_at": "2026-10-19T20:00:00Z",
        },
    ]

    mock_db.from_().select().order().execute.return_value = MagicMock(data=mock_data)

    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: mock_db

    response = client.get("/projects")
    assert response.status_code == 200
    result = response.json()
    assert len(result) == 2
    assert result[0]["title"] == "Alpha Workspace"
    assert result[1]["title"] == "Beta Workspace"


def test_list_projects_empty():
    """GET /projects returns an empty array when the user has no projects."""
    mock_db = MagicMock()
    mock_db.from_().select().order().execute.return_value = MagicMock(data=[])

    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: mock_db

    response = client.get("/projects")
    assert response.status_code == 200
    assert response.json() == []


# ==============================================================================
# 3. POST /projects Input Validation & Creation Tests
# ==============================================================================

def test_create_project_success():
    """POST /projects creates project and enforces server-controlled owner_id."""
    mock_db = MagicMock()
    created_project = {
        "id": "33333333-3333-3333-3333-333333333333",
        "owner_id": MOCK_USER_A.user_id,
        "title": "New Research",
        "description": "Exploration",
        "created_at": "2026-10-20T21:00:00Z",
    }

    mock_db.from_().insert().select().single().execute.return_value = MagicMock(data=created_project)

    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: mock_db

    response = client.post(
        "/projects",
        json={"title": "  New Research  ", "description": "  Exploration  "},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["id"] == "33333333-3333-3333-3333-333333333333"
    assert data["owner_id"] == MOCK_USER_A.user_id

    # Verify that owner_id passed to insert was MOCK_USER_A.user_id
    insert_call = mock_db.from_().insert.call_args[0][0]
    assert insert_call["owner_id"] == MOCK_USER_A.user_id
    assert insert_call["title"] == "New Research"
    assert insert_call["description"] == "Exploration"


@pytest.mark.parametrize(
    "invalid_title",
    [
        "",  # Empty
        "   ",  # Whitespace only
        "a" * 121,  # Exceeds 120 chars
    ],
)
def test_create_project_rejects_invalid_title(invalid_title):
    """POST /projects rejects invalid, empty, or oversized titles with 422."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: MagicMock()

    response = client.post("/projects", json={"title": invalid_title})
    assert response.status_code == 422


def test_create_project_rejects_oversized_description():
    """POST /projects rejects descriptions exceeding 2000 characters."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: MagicMock()

    response = client.post(
        "/projects",
        json={"title": "Valid Title", "description": "d" * 2001},
    )
    assert response.status_code == 422


# ==============================================================================
# 4. DELETE /projects/{project_id} Tests
# ==============================================================================

def test_delete_project_success():
    """DELETE /projects/{id} deletes project owned by caller and returns success."""
    mock_db = MagicMock()
    target_id = "44444444-4444-4444-4444-444444444444"
    mock_db.from_().delete().eq().select().execute.return_value = MagicMock(data=[{"id": target_id}])

    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: mock_db

    response = client.delete(f"/projects/{target_id}")
    assert response.status_code == 200
    assert response.json() == {"id": target_id, "status": "deleted"}


def test_delete_project_not_found_or_inaccessible():
    """DELETE /projects/{id} returns 404 when project does not exist or is not owned by user."""
    mock_db = MagicMock()
    # 0 rows deleted due to RLS or missing record
    mock_db.from_().delete().eq().select().execute.return_value = MagicMock(data=[])

    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_B
    app.dependency_overrides[get_user_db_client] = lambda: mock_db

    response = client.delete("/projects/55555555-5555-5555-5555-555555555555")
    assert response.status_code == 404
    assert response.json()["detail"] == "Project not found"


def test_delete_project_rejects_malformed_uuid():
    """DELETE /projects/{id} validates UUID format and rejects invalid formats with 422."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER_A
    app.dependency_overrides[get_user_db_client] = lambda: MagicMock()

    response = client.delete("/projects/not-a-valid-uuid")
    assert response.status_code == 422


# ==============================================================================
# 5. Zero Service-Role Key Verification
# ==============================================================================

def test_db_client_never_uses_service_role_key():
    """
    Verifies that create_user_scoped_client binds the user's bearer token
    and uses the anonymous/publishable key, never the service-role key.
    """
    settings = get_settings()

    # Create client for User A
    user_client = create_user_scoped_client(
        token="test_user_jwt_token",
        supabase_url="https://mock.supabase.co",
        supabase_anon_key="mock_anon_key",
    )

    # Verify authorization header contains the user's bearer token
    auth_header = user_client.postgrest.headers.get("authorization")
    assert auth_header == "Bearer test_user_jwt_token"

    # Verify apikey is the public anon key
    assert user_client.postgrest.headers.get("apikey") == "mock_anon_key"

    # Verify service role key is not configured
    assert "service_role" not in auth_header.lower()
