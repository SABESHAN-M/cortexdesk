from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "cortexdesk"
    app_env: str = "development"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    supabase_url: str = "https://your-project-ref.supabase.co"
    supabase_jwt_audience: str = "authenticated"
    supabase_anon_key: str = "your-supabase-anon-or-publishable-key"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

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


@lru_cache()
def get_settings() -> Settings:
    return Settings()
