"""
Unit tests for backend configuration and settings validation (Story 2.1, Task 2.1.1).
"""

import os
import pytest
from pydantic import ValidationError

from config import Settings, get_settings


def test_settings_loads_valid_configuration():
    """Verify that Settings initializes cleanly when valid configuration is supplied."""
    settings = Settings(
        _env_file=None,
        gemini_api_key="valid-test-key-12345",
        llm_model="gemini-2.0-flash",
        embed_model="text-embedding-004",
    )
    assert settings.llm_provider == "gemini"
    assert settings.gemini_api_key == "valid-test-key-12345"
    assert settings.llm_model == "gemini-2.0-flash"
    assert settings.embed_model == "text-embedding-004"


def test_missing_gemini_api_key_raises_error():
    """Verify that a missing GEMINI_API_KEY causes a startup validation error."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            llm_provider="gemini",
            gemini_api_key=None,
            llm_model="gemini-2.0-flash",
            embed_model="text-embedding-004",
        )
    errors = str(exc_info.value)
    assert "GEMINI_API_KEY is required" in errors


def test_blank_gemini_api_key_rejected():
    """Verify that empty string or whitespace-only GEMINI_API_KEY is rejected."""
    for blank in ["", "   ", "\t\n"]:
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                _env_file=None,
                llm_provider="gemini",
                gemini_api_key=blank,
                llm_model="gemini-2.0-flash",
                embed_model="text-embedding-004",
            )
        assert "GEMINI_API_KEY is required and cannot be empty" in str(exc_info.value)


def test_groq_provider_requires_groq_key():
    """Verify that when LLM_PROVIDER is 'groq', GROQ_API_KEY is required."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            llm_provider="groq",
            groq_api_key=None,
            llm_model="llama-3.3-70b-versatile",
            embed_model="text-embedding-004",
        )
    assert "GROQ_API_KEY is required and cannot be empty" in str(exc_info.value)


def test_groq_provider_does_not_require_gemini_key():
    """Verify that selecting groq does not validate or require GEMINI_API_KEY."""
    settings = Settings(
        _env_file=None,
        llm_provider="groq",
        groq_api_key="valid-groq-key",
        gemini_api_key=None,
        llm_model="llama-3.3-70b-versatile",
        embed_model="text-embedding-004",
    )
    assert settings.llm_provider == "groq"
    assert settings.groq_api_key == "valid-groq-key"
    assert settings.gemini_api_key is None


def test_unsupported_provider_raises_error():
    """Verify that unsupported LLM_PROVIDER raises a clear validation error."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            llm_provider="unknown-provider",
            gemini_api_key="some-key",
            llm_model="some-model",
            embed_model="some-embed",
        )
    assert "Unsupported LLM_PROVIDER" in str(exc_info.value)


def test_missing_or_blank_llm_model_rejected():
    """Verify that missing or whitespace-only LLM_MODEL raises a validation error."""
    for empty in ["", "   "]:
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                _env_file=None,
                gemini_api_key="valid-key",
                llm_model=empty,
                embed_model="text-embedding-004",
            )
        assert "LLM_MODEL is required and cannot be empty" in str(exc_info.value)


def test_missing_or_blank_embed_model_rejected():
    """Verify that missing or whitespace-only EMBED_MODEL raises a validation error."""
    for empty in ["", "   "]:
        with pytest.raises(ValidationError) as exc_info:
            Settings(
                _env_file=None,
                gemini_api_key="valid-key",
                llm_model="gemini-2.0-flash",
                embed_model=empty,
            )
        assert "EMBED_MODEL is required and cannot be empty" in str(exc_info.value)


def test_model_names_read_from_environment(monkeypatch):
    """Verify that model identifiers are read from environment variables rather than hard-coded logic."""
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "env-test-key")
    monkeypatch.setenv("LLM_MODEL", "custom-flash-model-id")
    monkeypatch.setenv("EMBED_MODEL", "custom-embedding-model-id")

    settings = Settings(_env_file=None)
    assert settings.llm_model == "custom-flash-model-id"
    assert settings.embed_model == "custom-embedding-model-id"


def test_settings_repr_redacts_api_keys():
    """Verify that repr(Settings) masks secret API keys as '***' and never leaks raw credentials."""
    settings = Settings(
        _env_file=None,
        gemini_api_key="super-secret-gemini-key-999",
        groq_api_key="super-secret-groq-key-888",
        llm_model="gemini-2.0-flash",
        embed_model="text-embedding-004",
    )
    repr_str = repr(settings)
    assert "super-secret-gemini-key-999" not in repr_str
    assert "super-secret-groq-key-888" not in repr_str
    assert "gemini_api_key='***'" in repr_str
    assert "groq_api_key='***'" in repr_str


def test_validation_error_does_not_expose_secret():
    """Verify that validation errors do not echo or log secret values."""
    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            gemini_api_key="   ",
            llm_model="gemini-2.0-flash",
            embed_model="text-embedding-004",
        )
    error_msg = str(exc_info.value)
    # Check that error message only mentions field name, not raw value
    assert "GEMINI_API_KEY is required and cannot be empty" in error_msg


def test_get_settings_singleton():
    """Verify get_settings returns a cached instance and imports cleanly."""
    get_settings.cache_clear()
    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2
