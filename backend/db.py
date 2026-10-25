"""
CortexDesk — User-Scoped Database Client Helper (Task 1.3.4)

Provides a per-request, user-scoped Supabase client configured with the
authenticated user's verified Bearer token and the project's anonymous key.

Security & Architectural Controls:
1. User-Scoped Identity: Every query executes within the PostgreSQL context of the
   calling user, strictly enforcing database Row Level Security (RLS) policies.
2. Zero Service-Role Access: Never uses or references the privileged service-role key.
3. No Global Mutation: Instantiates isolated client instances per request, preventing
   accidental session/token leakage across concurrent requests.
4. Bounded Timeouts: Enforces request timeouts on PostgREST calls (10s) to prevent hanging.
5. Token Redaction: Prevents sensitive JWT tokens from being written to logs or error outputs.
"""

import logging
from typing import Optional
from fastapi import Depends, HTTPException, status
from supabase import create_client, Client, ClientOptions

from config import get_settings, Settings
from auth import get_current_user, AuthenticatedUser

logger = logging.getLogger(__name__)


def create_user_scoped_client(
    token: str,
    supabase_url: str,
    supabase_anon_key: str,
    timeout: float = 10.0,
) -> Client:
    """
    Constructs an isolated Supabase client instance configured to execute
    database queries using the caller's JWT bearer token.
    """
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing access token for database authentication",
            headers={"WWW-Authenticate": "Bearer"},
        )

    options = ClientOptions(
        headers={"Authorization": f"Bearer {token.strip()}"},
        postgrest_client_timeout=timeout,
        auto_refresh_token=False,
        persist_session=False,
    )

    client: Client = create_client(
        supabase_url=supabase_url,
        supabase_key=supabase_anon_key,
        options=options,
    )
    return client


def get_user_db_client(
    user: AuthenticatedUser = Depends(get_current_user),
    settings: Settings = Depends(get_settings),
) -> Client:
    """
    FastAPI dependency returning a per-request Supabase database client bound
    to the active authenticated user's access token.
    """
    return create_user_scoped_client(
        token=user.raw_token,
        supabase_url=settings.supabase_url,
        supabase_anon_key=settings.supabase_anon_key,
    )
