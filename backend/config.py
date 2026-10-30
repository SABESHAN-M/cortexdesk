"""
CortexDesk — Backend Configuration & Settings Management (Task 2.1.1)

Provides strongly typed, validated application settings using pydantic-settings.
Enforces startup validation for required LLM provider credentials and model configurations.
"""

from functools import lru_cache
from pathlib import Path
from typing import List, Optional
from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    app_name: str = "cortexdesk"
    app_env: str = "development"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    supabase_url: str = "https://your-project-ref.supabase.co"
    supabase_jwt_audience: str = "authenticated"
    supabase_anon_key: str = "your-supabase-anon-or-publishable-key"

    # LLM Provider & Model Settings (Task 2.1.1)
    llm_provider: str = Field(
        default="gemini",
        description="Active LLM provider: 'gemini' or 'groq'",
    )
    gemini_api_key: Optional[str] = Field(
        default=None,
        description="Private API key for Google Gemini provider",
    )
    groq_api_key: Optional[str] = Field(
        default=None,
        description="Private API key for Groq provider",
    )
    llm_model: str = Field(
        default="",
        description="Configurable primary inference model identifier",
    )
    embed_model: str = Field(
        default="",
        description="Configurable embedding model identifier for future RAG pipelines",
    )
    llm_temperature: float = Field(
        default=0.3,
        description="Sampling temperature for LLM generation (default: 0.3)",
    )
    llm_max_output_tokens: int = Field(
        default=2048,
        description="Maximum output tokens for LLM generation (default: 2048)",
    )
    chat_rate_limit_per_minute: int = Field(
        default=5,
        ge=1,
        description="Per-user rate limit for /api/chat requests per minute (default: 5)",
    )

    # Search Provider Settings (Story 2.2, Task 2.2.1)
    tavily_api_key: Optional[str] = Field(
        default=None,
        description="Private API key for Tavily search provider",
    )

    model_config = SettingsConfigDict(
        env_file=(".env", str(BACKEND_DIR / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @field_validator("llm_model", mode="after")
    @classmethod
    def validate_llm_model(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("LLM_MODEL is required and cannot be empty")
        return v.strip()

    @field_validator("embed_model", mode="after")
    @classmethod
    def validate_embed_model(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("EMBED_MODEL is required and cannot be empty")
        return v.strip()

    @model_validator(mode="after")
    def validate_provider_credentials(self) -> "Settings":
        provider = (self.llm_provider or "").strip().lower()
        if provider == "gemini":
            if not self.gemini_api_key or not self.gemini_api_key.strip():
                raise ValueError(
                    "GEMINI_API_KEY is required and cannot be empty when LLM_PROVIDER is 'gemini'"
                )
        elif provider == "groq":
            if not self.groq_api_key or not self.groq_api_key.strip():
                raise ValueError(
                    "GROQ_API_KEY is required and cannot be empty when LLM_PROVIDER is 'groq'"
                )
        else:
            raise ValueError(
                f"Unsupported LLM_PROVIDER '{provider}'. Supported providers are 'gemini' and 'groq'."
            )
        return self

    @property
    def allowed_origins(self) -> List[str]:
        origins = []
        for item in self.cors_origins.split(","):
            trimmed = item.strip()
            if trimmed and trimmed != "*":
                origins.append(trimmed)
        return origins if origins else ["http://localhost:3000"]

    @property
    def supabase_issuer(self) -> str:
        base = self.supabase_url.rstrip("/")
        return f"{base}/auth/v1"

    @property
    def supabase_jwks_url(self) -> str:
        base = self.supabase_url.rstrip("/")
        return f"{base}/auth/v1/.well-known/jwks.json"

    def __repr__(self) -> str:
        masked_gemini = "***" if self.gemini_api_key else None
        masked_groq = "***" if self.groq_api_key else None
        masked_tavily = "***" if self.tavily_api_key else None
        return (
            f"Settings(app_name={self.app_name!r}, app_env={self.app_env!r}, "
            f"llm_provider={self.llm_provider!r}, llm_model={self.llm_model!r}, "
            f"embed_model={self.embed_model!r}, gemini_api_key={masked_gemini!r}, "
            f"groq_api_key={masked_groq!r}, tavily_api_key={masked_tavily!r})"
        )


@lru_cache()
def get_settings() -> Settings:
    return Settings()
