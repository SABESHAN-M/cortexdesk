.PHONY: setup dev dev-frontend dev-backend build test lint clean

# Default target
all: setup

# One-step initial setup
setup:
	node scripts/setup.js

# Run frontend and backend concurrently
dev:
	npm run dev

# Run only frontend
dev-frontend:
	npm run dev:frontend

# Run only backend
dev-backend:
	npm run dev:backend

# Build frontend production bundle
build:
	npm run build

# Run backend test suite
test:
	npm test

# Lint frontend
lint:
	npm run lint

# Clean build artifacts
clean:
	rm -rf frontend/.next frontend/out frontend/node_modules node_modules
