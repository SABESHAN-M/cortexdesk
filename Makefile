.PHONY: install dev dev-frontend dev-backend build test lint setup check-env db-up db-down clean check-node check-uv

# Default target
all: install

# Prerequisite checks
check-node:
	@command -v node >/dev/null 2>&1 || (echo "Error: Node.js (>=20.0.0) is not installed." >&2; exit 1)
	@command -v npm >/dev/null 2>&1 || (echo "Error: npm is not installed." >&2; exit 1)

check-uv:
	@command -v uv >/dev/null 2>&1 || (echo "Error: uv is not installed. Visit https://astral.sh/uv to install." >&2; exit 1)

# Install monorepo dependencies and initialize environment
install: check-node
	npm install
	npm run install:all

# Run full development stack concurrently
dev: check-node check-uv
	npm run dev

# Run only frontend
dev-frontend: check-node
	npm run dev:frontend

# Run only backend
dev-backend: check-uv
	npm run dev:backend

# Build frontend production bundle
build: check-node
	npm run build

# Run tests
test: check-uv
	npm test

# Lint frontend
lint: check-node
	npm run lint

# Start local PostgreSQL with pgvector
db-up:
	docker compose up -d

# Stop local PostgreSQL
db-down:
	docker compose down

# Clean build and test artifacts
clean:
	rm -rf frontend/.next frontend/out frontend/node_modules node_modules .pytest_cache
