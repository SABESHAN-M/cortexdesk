# CortexDesk

> An AI-augmented personal cognitive workspace combining a high-performance Next.js web application with a modular FastAPI agentic backend and PostgreSQL vector storage.

---

## 🏛 Monorepo Architecture Overview

CortexDesk is structured as a production-oriented monorepo:

```text
Cortexdesk/
├── backend/                  # FastAPI Python backend service
│   ├── main.py               # API server entrypoint & CORS configuration
│   ├── pyproject.toml        # Backend dependencies & metadata (managed with uv)
│   ├── routers/              # API endpoints and route handlers
│   ├── services/             # Core business logic and integrations
│   └── tests/                # Backend unit and integration test suite
├── frontend/                 # Next.js (v16) App Router frontend
│   ├── app/                  # Application pages and layouts
│   ├── components/           # Reusable UI components
│   ├── proxy.ts              # Route middleware & session validation
│   └── utils/supabase/       # Client & server database/auth utilities
├── database/                 # Database migrations and schema definitions
│   └── migrations/           # PostgreSQL migration scripts
├── tests/                    # Cross-application integration and end-to-end tests
├── scripts/                  # Cross-platform developer automation
│   ├── setup.js              # One-step environment bootstrapper
│   └── check-env.js          # Environment configuration validator
├── .github/                  # CI/CD workflows and repository metadata
├── docker-compose.yml        # Local PostgreSQL container with pgvector support
├── Makefile                  # Portable developer commands
├── package.json              # Monorepo orchestration manifest
└── pytest.ini                # Cross-application test configuration
```

---

## 📋 Prerequisites

Before starting, ensure the following tools are installed on your machine:

| Prerequisite | Minimum Version | Installation Guidance |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` | Download from [nodejs.org](https://nodejs.org/) |
| **npm** | Latest | Bundled with Node.js |
| **Python** | `3.11` to `3.13` | Download from [python.org](https://www.python.org/) |
| **uv** | Latest *(recommended)* | Windows: `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"`<br>macOS/Linux: `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **Docker** | Latest | Required for local PostgreSQL with pgvector ([docker.com](https://www.docker.com/)) |

---

## ⚡ Quick Start

Get the entire development environment running in 3 steps:

### 1. Install dependencies & initialize environment
```bash
npm run setup
# Or using make:
make install
```
> **What this does automatically:**
> - Validates Node.js version (`>= 20.0.0`).
> - Copies `.env.example` templates to `.env`, `frontend/.env.local`, and `backend/.env` if not already present.
> - Installs root and frontend Node dependencies.
> - Syncs the Python virtual environment via `uv sync`.

### 2. Start local PostgreSQL with pgvector
```bash
docker compose up -d
# Or using make:
make db-up
```
This spins up PostgreSQL 16 with the `pgvector` extension pre-installed on port `5432` with a persistent named volume.

### 3. Start the application
```bash
npm run dev
# Or using make:
make dev
```
- **Web Frontend**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend**: [http://localhost:8000](http://localhost:8000)
- **API Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

## 🔑 Environment Configuration

CortexDesk maintains isolated environment templates for root, frontend, and backend. Never commit real credentials or secrets to Git.

1. **Root `.env.example`** → [`.env`](file:///.env)  
   Contains general project metadata and shared development credentials.
2. **Frontend `frontend/.env.example`** → [`frontend/.env.local`](file:///frontend/.env.local)  
   Exposes client-safe variables prefixed with `NEXT_PUBLIC_`:
   ```ini
   NEXT_PUBLIC_APP_NAME=cortexdesk
   NEXT_PUBLIC_API_URL=http://localhost:8000
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
3. **Backend `backend/.env.example`** → [`backend/.env`](file:///backend/.env)  
   Contains server-only secrets (API keys, Supabase service-role keys, database passwords). Privileged keys must never use `NEXT_PUBLIC_`.

To verify your environment configuration at any time:
```bash
npm run check-env
```

---

## 🐘 Local PostgreSQL & pgvector Setup

Local persistent vector storage is orchestrated via Docker Compose:

- **Start Database**:
  ```bash
  docker compose up -d
  ```
- **Verify Database Health**:
  ```bash
  docker compose ps
  ```
- **Stop Database**:
  ```bash
  docker compose down
  ```
- **Enabling pgvector**:  
  The binary is pre-installed in the container. To enable the extension in SQL or automated migrations:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

*(Note: Advanced document schemas, chunking pipelines, and RAG migrations depend on subsequent tasks).*

---

## 🛠 Available Monorepo Commands

| Command | Makefile Equivalent | Description |
| :--- | :--- | :--- |
| `npm run setup` | `make install` | Initial bootstrap: copies templates, installs npm and Python dependencies |
| `npm run dev` | `make dev` | Concurrently runs frontend (`:3000`) and backend (`:8000`) |
| `npm run dev:frontend` | `make dev-frontend` | Runs only the Next.js development server |
| `npm run dev:backend` | `make dev-backend` | Runs only the FastAPI Uvicorn server with hot reloading |
| `npm run lint` | `make lint` | Runs ESLint syntax and code quality checks on frontend |
| `npm test` | `make test` | Runs the test suite via pytest across `backend/tests` and `tests` |
| `npm run build` | `make build` | Generates the optimized Next.js production bundle |
| `npm run check-env` | — | Verifies required environment configuration files |

---

## 🧪 Testing & Verification

Run the automated test suite across the monorepo:
```bash
npm test
# Or:
make test
```
The root [`pytest.ini`](file:///pytest.ini) automatically discovers test cases in both `backend/tests/` and the cross-app `tests/` directory.

To check backend health directly in a running server:
```bash
curl http://localhost:8000/health
# Response: {"status":"ok"}
```

---

## 📌 Milestones & Subsequent Task Dependencies

The following features depend on subsequent roadmap tasks:
- **Authentication Flow (Supabase)**: Auth routes and session verification are ready for integration in upcoming auth tasks.
- **AI Agentic Workflows & Tool Execution**: Agent loops, LLM integrations, and LangGraph/LangChain executors depend on upcoming AI agent milestones.
- **Document Ingestion & Embeddings**: Automated chunking, vector embeddings generation, and vector index queries depend on RAG milestone tasks.

---

## 📄 License

This project is licensed under the [MIT License](file:///LICENSE) — see the `LICENSE` file for details.
