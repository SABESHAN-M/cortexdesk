"""
CortexDesk — Projects REST API Router (Task 1.3.4)

Implements authenticated REST endpoints for managing user project workspaces.

Security & Architectural Principles:
1. Strict Authentication: Every endpoint requires a verified Supabase JWT bearer token
   via the established `get_current_user` dependency.
2. User-Scoped RLS Execution: All database interactions use `get_user_db_client`,
   forwarding the user's JWT to PostgreSQL so Row Level Security (RLS) is applied.
3. Server-Controlled Ownership: `owner_id` is derived from the authenticated token
   and cannot be spoofed by client payloads.
4. Information Leakage Prevention: Inaccessible or nonexistent projects yield uniform
   HTTP 404 responses, preventing cross-tenant existence enumeration.
5. Error Sanitization: Suppresses internal SQL queries and connection traces from API responses.
"""

import logging
from typing import Optional, List
import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from supabase import Client

from auth import get_current_user, AuthenticatedUser
from db import get_user_db_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    title: str = Field(..., max_length=120, description="Display title for the project")
    description: Optional[str] = Field(None, max_length=2000, description="Optional project context")

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        trimmed = v.strip() if isinstance(v, str) else ""
        if not trimmed:
            raise ValueError("Project title cannot be empty or whitespace.")
        if len(trimmed) > 120:
            raise ValueError("Project title must not exceed 120 characters.")
        return trimmed

    @field_validator("description")
    @classmethod
    def validate_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        if len(trimmed) > 2000:
            raise ValueError("Project description must not exceed 2000 characters.")
        return trimmed


class ProjectResponse(BaseModel):
    id: str
    owner_id: str
    title: str
    description: Optional[str] = None
    created_at: str


class ProjectDeleteResponse(BaseModel):
    id: str
    status: str = "deleted"


@router.get("", response_model=List[ProjectResponse])
def list_projects(
    user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_user_db_client),
) -> List[ProjectResponse]:
    """
    Retrieves all projects owned by the authenticated caller, ordered by creation date descending.
    Protected by PostgreSQL RLS. Returns an empty array if no projects exist.
    """
    try:
        response = (
            db.from_("projects")
            .select("id, owner_id, title, description, created_at")
            .order("created_at", desc=True)
            .execute()
        )
        return response.data or []
    except Exception as exc:
        logger.warning("Failed to list projects: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve projects",
        )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreateRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_user_db_client),
) -> ProjectResponse:
    """
    Creates a new project owned by the authenticated user.
    Enforces title (1-120 chars) and description (<= 2000 chars) constraints.
    """
    try:
        response = (
            db.from_("projects")
            .insert({
                "title": payload.title,
                "description": payload.description,
                "owner_id": user.user_id,
            })
            .select("id, owner_id, title, description, created_at")
            .single()
            .execute()
        )
        if not response.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Project creation failed to return data",
            )
        return response.data
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to create project: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create project",
        )


@router.delete("/{project_id}", response_model=ProjectDeleteResponse)
def delete_project(
    project_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_user_db_client),
) -> ProjectDeleteResponse:
    """
    Deletes an existing project owned by the authenticated caller.
    Returns HTTP 404 if the project is not found or is owned by another user.
    """
    try:
        parsed_uuid = uuid.UUID(str(project_id).strip())
    except (ValueError, AttributeError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid project ID: must be a valid UUID format",
        )

    clean_id = str(parsed_uuid)

    try:
        response = (
            db.from_("projects")
            .delete()
            .eq("id", clean_id)
            .select("id")
            .execute()
        )
        if not response.data or len(response.data) == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Project not found",
            )
        return ProjectDeleteResponse(id=clean_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("Failed to delete project: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete project",
        )
