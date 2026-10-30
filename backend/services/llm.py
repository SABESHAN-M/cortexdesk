"""
CortexDesk — LLM Service Abstraction (Story 2.1, Task 2.1.3)

Provides a unified asynchronous interface to the configured LLM provider (Google Gemini)
with generation configuration, transient error retries via Tenacity, async streaming,
client lifecycle management, and privacy-safe operational logging.
"""

import logging
import time
from typing import Any, AsyncIterator, Optional

import httpx
from google import genai
from google.genai import errors, types
from tenacity import (
    AsyncRetrying,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

from config import Settings, get_settings

logger = logging.getLogger(__name__)


def is_transient_error(exc: BaseException) -> bool:
    """
    Distinguishes transient/retryable provider or transport errors from permanent failures.
    Transient errors:
      - 5xx Server errors (google.genai.errors.ServerError)
      - Rate limit / Quota exceeded (google.genai.errors.APIError with code 429)
      - Network, timeout, and connection drops
    Permanent errors:
      - 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found
    """
    if isinstance(exc, errors.ServerError):
        return True
    if isinstance(exc, errors.APIError):
        code = getattr(exc, "code", None)
        return code in (429, 500, 502, 503, 504)
    if isinstance(
        exc, (httpx.TimeoutException, httpx.NetworkError, ConnectionError, TimeoutError)
    ):
        return True
    return False


class LLMService:
    """
    Provider-facing LLM service communicating with Google Gemini via google-genai async API.
    """

    def __init__(
        self,
        settings: Optional[Settings] = None,
        client: Optional[genai.Client] = None,
        retry_min_wait: float = 1.0,
        retry_max_wait: float = 8.0,
        max_attempts: int = 3,
    ) -> None:
        self.settings = settings or get_settings()
        self._client = client
        self.model = self.settings.llm_model
        self.temperature = getattr(self.settings, "llm_temperature", 0.3)
        self.max_output_tokens = getattr(self.settings, "llm_max_output_tokens", 2048)
        self.retry_min_wait = retry_min_wait
        self.retry_max_wait = retry_max_wait
        self.max_attempts = max_attempts

    @property
    def client(self) -> genai.Client:
        """Lazily instantiates the Google Gemini SDK client without early network calls."""
        if self._client is None:
            self._client = genai.Client(api_key=self.settings.gemini_api_key)
        return self._client

    async def aclose(self) -> None:
        """Closes the underlying asynchronous HTTP client resources."""
        if self._client is not None:
            try:
                await self._client.aio.aclose()
            except Exception as exc:
                logger.debug("Error closing LLM async client: %s", type(exc).__name__)
            finally:
                self._client = None

    async def __aenter__(self) -> "LLMService":
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        await self.aclose()

    def _config(
        self,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
        system: Optional[str] = None,
    ) -> types.GenerateContentConfig:
        """Constructs generation configuration using SDK-supported parameters."""
        temp = self.temperature if temperature is None else temperature
        max_tokens = (
            self.max_output_tokens
            if max_output_tokens is None
            else max_output_tokens
        )
        sys_instruction = system.strip() if system and system.strip() else None

        return types.GenerateContentConfig(
            temperature=temp,
            max_output_tokens=max_tokens,
            system_instruction=sys_instruction,
        )

    async def complete(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
    ) -> str:
        """
        Asynchronously generates text from the model with transient error retries.
        Retries transient errors up to 3 total attempts using exponential backoff (1s to 8s).
        Returns "" if the response contains no usable text.
        """
        config = self._config(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            system=system,
        )
        start_time = time.monotonic()

        retrying = AsyncRetrying(
            stop=stop_after_attempt(self.max_attempts),
            wait=wait_exponential(
                multiplier=1, min=self.retry_min_wait, max=self.retry_max_wait
            ),
            retry=retry_if_exception(is_transient_error),
            reraise=True,
        )

        response = None
        async for attempt in retrying:
            with attempt:
                try:
                    response = await self.client.aio.models.generate_content(
                        model=self.model,
                        contents=prompt,
                        config=config,
                    )
                except Exception as exc:
                    elapsed = time.monotonic() - start_time
                    logger.warning(
                        "LLM complete attempt %d failed: model=%s duration_s=%.3f error_type=%s",
                        attempt.retry_state.attempt_number,
                        self.model,
                        elapsed,
                        type(exc).__name__,
                        extra={
                            "model": self.model,
                            "attempt": attempt.retry_state.attempt_number,
                            "duration_s": round(elapsed, 3),
                            "status": "failure",
                            "error_type": type(exc).__name__,
                        },
                    )
                    raise

        elapsed = time.monotonic() - start_time
        text = getattr(response, "text", "") or ""

        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = getattr(usage, "prompt_token_count", None) if usage else None
        output_tokens = getattr(usage, "candidates_token_count", None) if usage else None
        total_tokens = getattr(usage, "total_token_count", None) if usage else None

        logger.info(
            "LLM complete succeeded: model=%s duration_s=%.3f prompt_tokens=%s output_tokens=%s total_tokens=%s",
            self.model,
            elapsed,
            prompt_tokens,
            output_tokens,
            total_tokens,
            extra={
                "model": self.model,
                "duration_s": round(elapsed, 3),
                "status": "success",
                "prompt_tokens": prompt_tokens,
                "output_tokens": output_tokens,
                "total_tokens": total_tokens,
            },
        )
        return text

    async def generate_content(
        self,
        contents: Any,
        config: Optional[types.GenerateContentConfig] = None,
    ) -> Any:
        """
        Asynchronously invokes generate_content with transient error retries (5xx, 429, timeouts).
        Used by the agent orchestrator for robust multi-turn conversations and function calling.
        """
        start_time = time.monotonic()
        retrying = AsyncRetrying(
            stop=stop_after_attempt(self.max_attempts),
            wait=wait_exponential(
                multiplier=1, min=self.retry_min_wait, max=self.retry_max_wait
            ),
            retry=retry_if_exception(is_transient_error),
            reraise=True,
        )

        response = None
        async for attempt in retrying:
            with attempt:
                try:
                    response = await self.client.aio.models.generate_content(
                        model=self.model,
                        contents=contents,
                        config=config,
                    )
                except Exception as exc:
                    elapsed = time.monotonic() - start_time
                    logger.warning(
                        "LLM generate_content attempt %d failed: model=%s duration_s=%.3f error_type=%s: %s",
                        attempt.retry_state.attempt_number,
                        self.model,
                        elapsed,
                        type(exc).__name__,
                        exc,
                    )
                    raise

        return response

    async def stream(
        self,
        prompt: str,
        system: Optional[str] = None,
        temperature: Optional[float] = None,
        max_output_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """
        Asynchronously streams text chunks as they arrive from the provider.
        Yields only non-empty text chunks without buffering the full response.
        """
        config = self._config(
            temperature=temperature,
            max_output_tokens=max_output_tokens,
            system=system,
        )
        start_time = time.monotonic()
        chunks_yielded = 0
        prompt_tokens = None
        output_tokens = None
        total_tokens = None

        try:
            response_stream = await self.client.aio.models.generate_content_stream(
                model=self.model,
                contents=prompt,
                config=config,
            )
            async for chunk in response_stream:
                usage = getattr(chunk, "usage_metadata", None)
                if usage:
                    prompt_tokens = getattr(usage, "prompt_token_count", prompt_tokens)
                    output_tokens = getattr(usage, "candidates_token_count", output_tokens)
                    total_tokens = getattr(usage, "total_token_count", total_tokens)

                chunk_text = getattr(chunk, "text", None)
                if chunk_text:
                    chunks_yielded += 1
                    yield chunk_text

            elapsed = time.monotonic() - start_time
            logger.info(
                "LLM stream succeeded: model=%s duration_s=%.3f chunks_yielded=%d prompt_tokens=%s output_tokens=%s total_tokens=%s",
                self.model,
                elapsed,
                chunks_yielded,
                prompt_tokens,
                output_tokens,
                total_tokens,
                extra={
                    "model": self.model,
                    "duration_s": round(elapsed, 3),
                    "status": "success",
                    "chunks_yielded": chunks_yielded,
                    "prompt_tokens": prompt_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": total_tokens,
                },
            )
        except Exception as exc:
            elapsed = time.monotonic() - start_time
            logger.error(
                "LLM stream failed: model=%s duration_s=%.3f chunks_yielded=%d error_type=%s",
                self.model,
                elapsed,
                chunks_yielded,
                type(exc).__name__,
                extra={
                    "model": self.model,
                    "duration_s": round(elapsed, 3),
                    "status": "failure",
                    "chunks_yielded": chunks_yielded,
                    "error_type": type(exc).__name__,
                },
            )
            raise


# Shared module-level instance (Task 2.1.3, Requirement 7)
llm = LLMService()
