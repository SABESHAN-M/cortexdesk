"""
Pytest configuration and global test fixtures for CortexDesk backend.
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from config import get_settings


def pytest_configure(config):
    """
    Ensure automated test collection and execution operate with isolated,
    safe dummy credentials if not already provided in the environment.
    """
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    os.environ.setdefault("SUPABASE_ANON_KEY", "dummy-anon-key-for-testing")
    os.environ.setdefault("SUPABASE_JWT_AUDIENCE", "authenticated")
    os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
    os.environ.setdefault("LLM_PROVIDER", "gemini")
    os.environ.setdefault("GEMINI_API_KEY", "dummy-gemini-test-key")
    os.environ.setdefault("LLM_MODEL", "gemini-2.0-flash")
    os.environ.setdefault("EMBED_MODEL", "text-embedding-004")
    # Clear settings cache so it picks up test defaults
    get_settings.cache_clear()
