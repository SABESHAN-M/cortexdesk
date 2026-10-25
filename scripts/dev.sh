#!/usr/bin/env bash
# ==============================================================================
# CortexDesk — Local Development Launcher
# Starts the frontend (Next.js) and backend (FastAPI) concurrently.
# ==============================================================================

set -euo pipefail

# Reliably resolve the repository root relative to this script's directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Switch to the repository root
cd "${REPO_ROOT}"

echo "Starting CortexDesk development stack (web: 3000, api: 8000)..."

# Trap termination signals to ensure clean shutdown
trap 'echo "Shutting down CortexDesk development processes..."; exit 0' SIGINT SIGTERM

# Execute the root development orchestration script and propagate its exit code
exec npm run dev