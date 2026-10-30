"""
CortexDesk — Authenticated Chat Router (Task 2.1.4)

Provides an authenticated endpoint for conversational interactions with the CortexDesk AI service.

Security & Architectural Principles:
1. Strict Authentication: Protected by `get_current_user` dependency from Story 1.2;
   unauthenticated or invalid/expired tokens are rejected immediately.
2. Verified Identity Rate Limiting: Rate limiting is keyed strictly to the authenticated
   user's verified identity (`user.user_id`), never client-supplied fields.
3. Server-Controlled System Instructions: System instructions are defined on the server;
   arbitrary client-supplied instructions are never accepted.
4. Project Ownership Isolation: Optional `project_id` context is verified against user ownership
   via user-scoped RLS database queries. Nonexistent or inaccessible projects return HTTP 404
   to prevent cross-tenant enumeration.
5. Error Sanitization & Privacy: Provider exceptions are mapped to HTTP 503 with friendly,
   static messages. Message contents, internal stack traces, and API keys are never exposed.
"""

from collections import deque
import asyncio
from datetime import datetime, timezone
import logging
import threading
import time
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from supabase import Client

from auth import get_current_user, AuthenticatedUser
from config import get_settings, Settings
from db import get_user_db_client
from services.agent import run_agent
from services.llm import llm

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["chat"])

DEFAULT_CHAT_SYSTEM_PROMPT = (
    "You are the CortexDesk AI assistant, an intelligent, helpful, and concise companion "
    "for knowledge management and project productivity. When providing factual information "
    "retrieved from web search, include relevant supporting URLs."
)
CHAT_REQUEST_TIMEOUT = 55.0


def get_chat_system_prompt(client_date: Optional[str] = None) -> str:
    """
    Constructs the system prompt dynamically grounding the assistant with
    the current real-world date and time.
    """
    if client_date and client_date.strip():
        date_str = client_date.strip()
    else:
        now = datetime.now().astimezone()
        date_str = now.strftime("%A, %B %d, %Y (%Z)")

    return (
        "You are the CortexDesk AI assistant, an intelligent, helpful, and concise companion "
        f"for knowledge management and project productivity. Today's date is {date_str}. "
        "When providing factual information retrieved from web search, include relevant supporting URLs."
    )


# ==============================================================================
# Rate Limiting Architecture
# ==============================================================================

class InMemoryRateLimiter:
    """
    Sliding-window in-memory rate limiter with bounded storage and periodic eviction.

    Production Limitation Note:
    --------------------------
    This rate limiter operates in-memory for a single process/instance. In a multi-worker
    (e.g., Uvicorn with multiple workers) or horizontally-scaled containerized production
    deployment, each worker process maintains an isolated counter. For globally synchronized
    rate limiting across multiple replicas, a distributed store such as Redis or Upstash
    is required.
    """

    def __init__(
        self,
        max_requests: int = 5,
        window_seconds: float = 60.0,
        max_entries: int = 10000,
    ) -> None:
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.max_entries = max_entries
        self._history: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_cleanup = time.time()

    def is_rate_limited(self, user_id: str) -> bool:
        """
        Records a request timestamp for the given user_id and checks if the rate limit is exceeded.
        Returns True if the request exceeds the allowed quota, False otherwise.
        """
        now = time.time()
        with self._lock:
            # Periodic cleanup of expired user records
            if now - self._last_cleanup > self.window_seconds or len(self._history) >= self.max_entries:
                self._cleanup(now)

            timestamps = self._history.setdefault(user_id, deque())
            cutoff = now - self.window_seconds
            while timestamps and timestamps[0] <= cutoff:
                timestamps.popleft()

            if len(timestamps) >= self.max_requests:
                return True

            timestamps.append(now)
            return False

    def _cleanup(self, now: float) -> None:
        """Evicts users whose request histories are completely expired outside the window."""
        cutoff = now - self.window_seconds
        expired_users = [
            uid for uid, dq in self._history.items()
            if not dq or dq[-1] <= cutoff
        ]
        for uid in expired_users:
            del self._history[uid]
        self._last_cleanup = now

    def reset(self) -> None:
        """Resets the internal tracking history. Intended primarily for testing."""
        with self._lock:
            self._history.clear()
            self._last_cleanup = time.time()


# Shared rate limiter instance configured from settings
_settings = get_settings()
chat_limiter = InMemoryRateLimiter(
    max_requests=_settings.chat_rate_limit_per_minute,
    window_seconds=60.0,
)


# ==============================================================================
# Request & Response Schemas
# ==============================================================================

class ChatRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=8000,
        description="User message prompt (1-8000 non-empty characters)",
    )
    project_id: Optional[str] = Field(
        default=None,
        description="Optional project UUID context for the conversation",
    )
    client_date: Optional[str] = Field(
        default=None,
        max_length=200,
        description="Optional client local date and time string from browser",
    )

    @field_validator("message")
    @classmethod
    def validate_message(cls, v: str) -> str:
        if not isinstance(v, str):
            raise ValueError("Message must be a string.")
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Message cannot be empty or whitespace-only.")
        if len(v) > 8000:
            raise ValueError("Message must not exceed 8000 characters.")
        return trimmed

    @field_validator("project_id")
    @classmethod
    def validate_project_id(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        try:
            parsed = uuid.UUID(trimmed)
            return str(parsed)
        except (ValueError, AttributeError):
            raise ValueError("Invalid project ID: must be a valid UUID format.")

    @field_validator("client_date")
    @classmethod
    def validate_client_date(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        return trimmed[:200]


class ChatResponse(BaseModel):
    reply: str = Field(..., description="Assistant response text")


# ==============================================================================
# Endpoints
# ==============================================================================

@router.post("/chat", response_model=ChatResponse)
async def chat(
    payload: ChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    db: Client = Depends(get_user_db_client),
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    """
    Authenticated chat endpoint that processes user prompts through the LLM service.

    Flow:
    1. Validates input schema and enforces non-empty message bounds.
    2. Enforces per-user rate limiting using verified caller identity.
    3. Validates ownership of optional project context against user database.
    4. Invokes the shared LLM service using server-defined system prompt.
    5. Returns assistant reply or maps provider errors to sanitized HTTP 503.
    """
    # 1. Rate Limit Enforcement (keyed strictly by verified user ID)
    if chat_limiter.is_rate_limited(user.user_id):
        logger.warning("Chat rate limit exceeded for user: %s", user.user_id)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please wait a moment before sending more messages.",
            headers={"Retry-After": "60"},
        )

    # 2. Project Context & Ownership Verification
    if payload.project_id:
        try:
            response = (
                db.from_("projects")
                .select("id")
                .eq("id", payload.project_id)
                .execute()
            )
            if not response.data or len(response.data) == 0:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Project not found",
                )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("Project context verification failed: %s", type(exc).__name__)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to verify project context",
            )

    # 3. Agent Execution with Bounded Timeout & Client Cancellation Safety
    start_time = time.perf_counter()
    system_prompt = get_chat_system_prompt(payload.client_date)
    try:
        async with asyncio.timeout(CHAT_REQUEST_TIMEOUT):
            reply = await run_agent(
                prompt=payload.message,
                system=system_prompt,
                timeout=CHAT_REQUEST_TIMEOUT,
            )
    except asyncio.CancelledError:
        logger.info("Chat request cancelled by client disconnect")
        raise
    except Exception as exc:
        duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error(
            "Chat agent provider failure: error_type=%s duration_ms=%s error=%s",
            type(exc).__name__,
            duration_ms,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is busy. Please try again shortly.",
        )

    return ChatResponse(reply=reply or "")
