from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import get_settings
from auth import get_current_user, AuthenticatedUser
from routers.projects import router as projects_router
from routers.chat import router as chat_router
from services.llm import llm

# Active configuration loaded from environment
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await llm.aclose()


app = FastAPI(
    title="CortexDesk API",
    version="0.1.0",
    description="FastAPI service for the CortexDesk cognitive workspace",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)


class UserProfileResponse(BaseModel):
    user_id: str
    email: Optional[str] = None


@app.get("/health")
def health() -> dict:
    """Public health endpoint for monitoring and local integration checks."""
    return {"status": "ok"}


@app.get("/me", response_model=UserProfileResponse)
def get_me(user: AuthenticatedUser = Depends(get_current_user)) -> UserProfileResponse:
    """
    Protected route returning identity metadata for the authenticated user.
    Never exposes raw bearer tokens in response bodies.
    """
    return UserProfileResponse(user_id=user.user_id, email=user.email)


app.include_router(projects_router)
app.include_router(chat_router)