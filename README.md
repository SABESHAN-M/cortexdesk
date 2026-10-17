# Cortexdesk

> An AI-powered collaborative cognitive workspace combining a high-performance Next.js frontend with a modular FastAPI agentic backend.

---

## ⚡ Quick Start (Run in 3 Steps)

Anyone cloning this repository can get up and running immediately with these steps:

### 1. Clone the repository
```bash
git clone <YOUR_REPOSITORY_URL>
cd Cortexdesk
```

### 2. Run one-time setup
```bash
npm run setup
```
> **What this does automatically:**
> - Verifies your Node.js version ($\ge$ 20).
> - Generates `.env`, `frontend/.env.local`, and `backend/.env` from templates if not present.
> - Installs all frontend dependencies (`Next.js`, `React`, etc.).
> - Syncs the Python backend virtual environment using `uv`.

### 3. Start the development server
```bash
npm run dev
```
- **Web App**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Backend**: [http://localhost:8000](http://localhost:8000)
- **API Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

---

## 📋 Prerequisites

Before starting, ensure you have:

| Tool | Recommended Version | Download / Install |
| :--- | :--- | :--- |
| **Node.js** | `>= 20.0.0` | [nodejs.org](https://nodejs.org/) |
| **Python** | `>= 3.12` | [python.org](https://www.python.org/) |
| **uv** *(recommended)* | Latest | `powershell -c "irm https://astral.sh/uv/install.ps1 \| iex"` (Win) or `curl -LsSf https://astral.sh/uv/install.sh \| sh` (Mac/Linux) |

*Note: If `uv` is not installed, standard Python virtual environments (`python -m venv .venv` and `pip install -r requirements.txt`) can be used as fallback.*

---

## 🔑 Environment Configuration

When you run `npm run setup`, default environment templates are copied for you:

1. **`frontend/.env.local`** (Frontend public variables):
   ```ini
   NEXT_PUBLIC_APP_NAME=cortxdesk
   NEXT_PUBLIC_API_URL=http://localhost:8000
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
   ```
2. **`backend/.env`** (Backend private keys, LLM keys, DB secrets):
   ```ini
   BACKEND_PORT=8000
   CORS_ORIGINS=http://localhost:3000
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   GEMINI_API_KEY=your-gemini-key
   GROQ_API_KEY=your-groq-key
   ```
3. **Verify Configuration**:
   ```bash
   npm run check-env
   ```

---

## 🛠 Available Scripts

You can run all commands directly from the repository root:

| Command | Description |
| :--- | :--- |
| `npm run setup` | Automated bootstrap: creates `.env` files, installs frontend and backend packages |
| `npm run dev` | Runs both Frontend (`:3000`) and Backend (`:8000`) concurrently |
| `npm run dev:frontend` | Runs only the Next.js frontend |
| `npm run dev:backend` | Runs only the FastAPI backend with hot reloading |
| `npm run build` | Compiles and optimizes the Next.js production build |
| `npm run lint` | Runs ESLint code style and syntax checks |
| `npm test` | Runs the Python backend test suite via `pytest` |
| `npm run check-env` | Checks that required `.env` files exist and are populated |

*(Note for Mac/Linux developers: `make setup`, `make dev`, `make test`, and `make build` are also supported via the provided `Makefile`)*

---

## 📁 Repository Structure

```text
Cortexdesk/
├── backend/               # FastAPI Python service
│   ├── main.py            # API server entrypoint & CORS config
│   ├── pyproject.toml     # Python dependencies & metadata
│   ├── routers/           # API route handlers
│   ├── services/          # Business logic & LLM integrations
│   └── tests/             # Pytest automated test suite
├── frontend/              # Next.js 16 Web Application
│   ├── app/               # App Router pages (/login, /dashboard, etc.)
│   ├── components/        # Reusable UI components
│   ├── proxy.ts           # Route middleware & session validation
│   ├── utils/supabase/    # Browser & server Supabase clients
│   └── package.json       # Frontend scripts and dependencies
├── scripts/               # Cross-platform developer automation
│   ├── setup.js           # Multi-platform bootstrap script
│   └── check-env.js       # Environment configuration validator
├── .env.example           # Root environment variable documentation
├── Makefile               # Unix make targets
└── package.json           # Workspace root orchestration & scripts
```

---

## ❓ Troubleshooting

### 1. "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY"
- Ensure `frontend/.env.local` exists.
- Run `npm run setup` to generate it, then replace the placeholder keys with your project's Supabase URL and anon key.

### 2. Python / `uv` command not found
- Install `uv` using:
  - **Windows**: `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
  - **macOS / Linux**: `curl -LsSf https://astral.sh/uv/install.sh | sh`
- Or manually create a Python venv:
  ```bash
  cd backend
  python -m venv .venv
  pip install -r ../requirements.txt
  ```

### 3. Port 8000 or 3000 already in use
- You can change `BACKEND_PORT=8001` in `.env` or run frontend on another port with `npm --prefix frontend run dev -- -p 3001`.
