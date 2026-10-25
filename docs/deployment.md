# CortexDesk Production Deployment Guide

This document provides canonical deployment configurations, environment specifications, operational procedures, and self-deployment instructions for both the **Next.js Frontend** (Vercel) and the **FastAPI Backend** (Render / Koyeb) from the CortexDesk monorepo.

---

## 🚦 Deployment Status & Merge Gate Alignment

| Service | Target Platform | Local Readiness | Remote Hosting Status | Production URL |
| :--- | :--- | :---: | :---: | :--- |
| **Frontend** | **Vercel** | **VERIFIED** (`next build` 8 routes passed) | **PENDING USER SELF-DEPLOYMENT (BLOCKED)** | *Pending manual deployment* |
| **Backend** | **Render / Koyeb** | **VERIFIED** (46 pytest tests passed) | **PENDING DASHBOARD DEPLOYMENT (BLOCKED)** | *Pending service creation* |

> [!NOTE]
> In accordance with Task 1.4.3, the `main` branch is protected by automated merge gates:
> - Required checks: `Frontend lint and build`, `Backend tests`
> - Mandatory Code Owner approval: `@sabeshan-m`
> - Automatic deployment to production triggers on merged commits to `main`.

---

# PART 1: Frontend Deployment (Vercel)

## 🏛 1. Vercel Project Configuration

CortexDesk is structured as a monorepo. Vercel must build exclusively from `frontend/` while preserving root repository governance.

### Core Project Settings

| Setting | Configuration Value | Notes |
| :--- | :--- | :--- |
| **Project Name** | `cortexdesk` | Or `cortexdesk-frontend` |
| **Framework Preset** | **Next.js** | Automatically detects Next.js App Router (v16.3+) |
| **Root Directory** | **`frontend`** | **Crucial**: Directs Vercel build container into frontend package |
| **Build Command** | `npm run build` | Default `next build` |
| **Output Directory** | `.next` | Standard Next.js output |
| **Install Command** | `npm ci` | Strict lockfile installation from `frontend/package-lock.json` |
| **Node.js Version** | **22.x** (or `>= 20.0.0`) | Matches engine requirement |
| **Production Branch** | `main` | Automatic deployment from protected `main` |

---

## 🔑 2. Frontend Environment Variables

Configure under **Project Settings → Environment Variables** for **Production** and **Preview**:

| Variable Name | Environments | Description | Example / Initial Value |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Production, Preview | Application display name | `cortexdesk` |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Supabase project API gateway | `https://<your-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Supabase client-safe anonymous key | `eyJhbGci...` |
| `NEXT_PUBLIC_API_URL` | Production, Preview | Backend API URL | Updated to real backend URL once Task 1.4.5 is live |

---

# PART 2: Backend FastAPI Deployment (Render / Koyeb)

## 🏛 3. Hosting Platform Architecture

The CortexDesk backend is a lightweight, asynchronous FastAPI service running on Python 3.12 managed by `uv`.

### Option A: Render (Recommended — Native Python Web Service)
Render natively executes Python web services and can be configured manually in the dashboard or automatically via the committed [render.yaml](file:///s:/Cortexdesk/render.yaml) blueprint.

| Setting | Configuration Value | Notes |
| :--- | :--- | :--- |
| **Service Type** | **Web Service** | Public web endpoint |
| **Name** | `cortexdesk-api` | Public hostname slug |
| **Environment / Runtime** | **Python 3** | Uses `.python-version` (3.12) |
| **Root Directory** | `backend` | Isolates backend from root monorepo |
| **Build Command** | `pip install uv && uv sync --frozen --no-dev` | Deterministic dependency sync from `uv.lock` |
| **Start Command** | `uv run uvicorn main:app --host 0.0.0.0 --port $PORT` | Binds to dynamic port injected by Render |
| **Branch** | `main` | Continuous deployment from `main` |
| **Health Check Path** | `/health` | Public endpoint returning `{"status": "ok"}` |
| **Auto-Deploy** | **Yes** | Redeploys automatically on merge to `main` |

### Option B: Docker Container Deployment (Render or Koyeb)
For containerized deployments on Render, Koyeb, or Cloud Run:
- **Dockerfile**: [backend/Dockerfile](file:///s:/Cortexdesk/backend/Dockerfile)
- **Base Image**: `python:3.12-slim` with official `ghcr.io/astral-sh/uv:latest`
- **Security**: Runs as unprivileged non-root user (`appuser`, UID 1000)
- **Build Reproducibility**: `RUN uv sync --frozen --no-dev` ensures no dev dependencies enter production
- **Host & Port**: Binds to `0.0.0.0` and expands `${PORT}` dynamically via `CMD ["sh", "-c", "uv run uvicorn main:app --host 0.0.0.0 --port ${PORT}"]`
- **Asset Exclusion**: [backend/.dockerignore](file:///s:/Cortexdesk/backend/.dockerignore) and [.dockerignore](file:///s:/Cortexdesk/.dockerignore) prevent `.env`, credentials, `.venv`, and `node_modules` from being copied.

---

## 🔑 4. Backend Environment Variables

Configure these runtime environment variables in the hosting dashboard (e.g., Render Environment settings):

| Variable Name | Required | Description | Example / Recommended Value |
| :--- | :---: | :--- | :--- |
| `APP_NAME` | Optional | Application identifier | `cortexdesk` |
| `APP_ENV` | Recommended | Environment designation | `production` |
| `SUPABASE_URL` | **Yes** | Live Supabase project URL | `https://<your-project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | **Yes** | Server-side public Supabase anonymous key | `eyJhbGciOi...` |
| `SUPABASE_JWT_AUDIENCE`| **Yes** | Expected JWT audience claim | `authenticated` |
| `CORS_ORIGINS` | **Yes** | Comma-separated allowed frontend origins | `https://cortexdesk.vercel.app` (or Vercel preview domain) |

> [!WARNING]
> **Strict Principle of Least Privilege**:
> - **Never configure `SUPABASE_SERVICE_ROLE_KEY`** in the backend runtime.
> - CortexDesk's database operations execute strictly within the authenticated caller's identity via `backend/db.py:create_user_scoped_client` using the user's verified Bearer JWT and the project's public anon key.
> - Never set `CORS_ORIGINS=*`. The backend configuration explicitly strips wildcards to prevent credential leakages.

---

## 🚀 5. Backend Step-by-Step Deployment Instructions

### Deploying to Render via Web Dashboard

1. **Log in to Render**: Visit [dashboard.render.com](https://dashboard.render.com).
2. **Create Web Service**:
   - Click **New +** → **Web Service**.
   - Connect your GitHub repository: `SABESHAN-M/cortexdesk`.
3. **Configure Service Details**:
   - **Name**: `cortexdesk-api`
   - **Region**: Choose closest to Supabase region (e.g., Oregon, Frankfurt).
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install uv && uv sync --frozen --no-dev`
   - **Start Command**: `uv run uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
4. **Configure Environment Variables**:
   Click **Advanced** → **Add Environment Variable**:
   - `SUPABASE_URL` = your Supabase Project URL (`https://<project-ref>.supabase.co`)
   - `SUPABASE_ANON_KEY` = your Supabase public Anon key
   - `SUPABASE_JWT_AUDIENCE` = `authenticated`
   - `APP_ENV` = `production`
   - `CORS_ORIGINS` = `https://<your-vercel-app>.vercel.app` (add your Vercel URL once assigned)
5. **Set Health Check**:
   - Under **Health Check Path**, enter: `/health`
6. **Deploy**:
   - Click **Create Web Service**.
   - Wait for the build and deployment to complete (~2 minutes).

### Deploying via Render Blueprint (1-Click)
1. In the Render Dashboard, click **New +** → **Blueprint**.
2. Select repository `SABESHAN-M/cortexdesk`.
3. Render automatically reads [render.yaml](file:///s:/Cortexdesk/render.yaml).
4. Enter values for the un-synced variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CORS_ORIGINS`).
5. Click **Apply**.

---

## 🔗 6. Connecting Frontend & Backend

Once the backend service completes deployment and provides a public URL (e.g., `https://cortexdesk-api.onrender.com`):

1. **Verify Backend Health**:
   ```bash
   curl -i https://cortexdesk-api.onrender.com/health
   # Expected: HTTP 200 OK
   # Body: {"status": "ok"}
   ```
2. **Update Vercel Frontend Configuration**:
   - Open Vercel Dashboard → `cortexdesk` → **Project Settings** → **Environment Variables**.
   - Set `NEXT_PUBLIC_API_URL` to `https://cortexdesk-api.onrender.com` for **Production** and **Preview**.
3. **Redeploy Frontend**:
   - Go to Vercel **Deployments** → click the latest deployment → **Redeploy**.
4. **Update Backend CORS**:
   - In Render Dashboard, ensure `CORS_ORIGINS` includes the exact Vercel production domain.

---

## ⏳ 7. Free-Tier Limitations & Operational Considerations

- **Cold Starts / Free-Tier Sleep**:
  - Render and Koyeb free-tier instances spin down after 15 minutes of inbound HTTP inactivity.
  - The first request after a sleep period triggers a cold start (typically 30–50 seconds).
  - A slow initial response is expected behavior on free tiers, not an application defect.
  - Subsequent requests respond in `< 50ms`.
- **Health Check Resilience**:
  - The `/health` endpoint executes in-memory without making external database or JWKS network requests, ensuring instant health checks even during cold starts.
- **Rollback Procedure**:
  - If a bad deployment occurs, use Render Dashboard → **Deploys** → select previous healthy deploy → **Rollback to this deploy**.
