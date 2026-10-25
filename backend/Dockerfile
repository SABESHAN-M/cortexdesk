FROM python:3.12-slim

# Install uv binary from official distribution image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Create non-root system user and app directory
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app && \
    chown -R appuser:appuser /app

WORKDIR /app

# Copy dependency manifests for caching
COPY pyproject.toml uv.lock ./

# Install dependencies deterministically from lockfile
RUN uv sync --frozen --no-dev

# Copy application source code
COPY . .

# Set ownership to non-root user
RUN chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

ENV PORT=8000

CMD ["sh", "-c", "uv run uvicorn main:app --host 0.0.0.0 --port ${PORT}"]