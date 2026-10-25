# CortexDesk Production Deployment Guide

This document provides canonical deployment configurations, environment specifications, operational procedures, and self-deployment instructions for both the **Next.js Frontend** (Vercel) and the **FastAPI Backend** (Render / Koyeb) from the CortexDesk monorepo, as well as production integration and security specifications.

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
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Supabase project API gateway | `https://hcliddnesvmfbywphcvt.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Supabase client-safe anonymous key | `sb_publishable_...` |
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
| **Build Command** | `pip install uv && uv sync --active --frozen --no-dev` | Deterministic dependency sync into Render active environment |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` | Binds to dynamic port injected by Render |
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
| `SUPABASE_URL` | **Yes** | Live Supabase project URL | `https://hcliddnesvmfbywphcvt.supabase.co` |
| `SUPABASE_ANON_KEY` | **Yes** | Server-side public Supabase anonymous key | `sb_publishable_...` |
| `SUPABASE_JWT_AUDIENCE`| **Yes** | Expected JWT audience claim | `authenticated` |
| `CORS_ORIGINS` | **Yes** | Comma-separated allowed frontend origins | `https://<your-vercel-domain>.vercel.app` |
| `LLM_PROVIDER` | Optional | Active provider name (`gemini` or `groq`) | `gemini` |
| `GEMINI_API_KEY` | **Yes** (if Gemini) | Private API key for Google Gemini | Configured in hosting dashboard |
| `GROQ_API_KEY` | **Yes** (if Groq) | Private API key for Groq | Configured in hosting dashboard |
| `LLM_MODEL` | **Yes** | Primary inference model identifier | `gemini-2.0-flash` |
| `EMBED_MODEL` | **Yes** | Embedding model identifier for RAG | `text-embedding-004` |

> [!WARNING]
> **Strict Principle of Least Privilege & Credential Isolation**:
> - **Never configure `SUPABASE_SERVICE_ROLE_KEY`** in the backend runtime.
> - CortexDesk's database operations execute strictly within the authenticated caller's identity via `backend/db.py:create_user_scoped_client` using the user's verified Bearer JWT and the project's public anon key.
> - Never set `CORS_ORIGINS=*`. The backend configuration explicitly strips wildcards to prevent credential leakages.
> - **LLM Provider Keys (`GEMINI_API_KEY`, `GROQ_API_KEY`)**:
>   - Must be configured manually in the hosting provider dashboard (Render/Koyeb).
>   - Must remain exclusively on the backend; **never prefix with `NEXT_PUBLIC_`**.
>   - Never commit API keys to Git, Docker build arguments, or client bundles.


---

# PART 3: Production Integration & Security Hardening (Task 1.4.6)

## 🔐 5. Supabase Authentication URL Architecture

To ensure secure OAuth and PKCE authentication without open-redirect vulnerabilities:

### 1. Site URL & Narrowly Scoped Redirect Allowlist
In the Supabase Dashboard, navigate to **Authentication → URL Configuration**:

- **Site URL**:
  Set strictly to the verified Vercel production origin:
  ```
  https://<your-vercel-domain>.vercel.app
  ```
- **Redirect URLs (Narrowly Scoped Allowlist)**:
  Avoid open wildcard domains. Explicitly list only authorized endpoints:
  ```
  https://<your-vercel-domain>.vercel.app/auth/callback
  http://localhost:3000/auth/callback
  http://127.0.0.1:3000/auth/callback
  ```
  *(If testing specific Vercel preview deployments, add exact branch URLs rather than global wildcard redirects).*

### 2. GitHub OAuth Application Callback Architecture
- In GitHub Developer Settings (**Settings → Developer settings → OAuth Apps → CortexDesk**):
  - **Homepage URL**: `https://<your-vercel-domain>.vercel.app`
  - **Authorization callback URL**: Must point to **Supabase Auth**, NOT Vercel:
    ```
    https://hcliddnesvmfbywphcvt.supabase.co/auth/v1/callback
    ```
  - *Rationale*: GitHub redirects to Supabase's auth handler, which completes code exchange and issues the session before redirecting to the Next.js frontend at `/auth/callback`.

---

## 🛡️ 6. Production CORS Hardening

In the backend hosting environment (Render):
1. **Set `CORS_ORIGINS`**:
   ```
   https://<your-vercel-domain>.vercel.app
   ```
2. **Security Rules Enforced by Backend**:
   - **No Wildcards**: `backend/config.py` explicitly strips `*` from the allowed origins list.
   - **No Trailing Slashes**: Origins must be schemes + domains without paths (e.g. `https://cortexdesk.vercel.app`, NOT `https://cortexdesk.vercel.app/`).
   - **Credential Support**: `allow_credentials=True` requires exact origin matches; wildcard origins with credentials are fundamentally blocked by browser CORS specifications.
   - **Local Isolation**: `http://localhost:3000` is kept in local `.env`, not in production.

---

## ⚡ 7. Cold-Start UX & Error Handling Architecture

Free-tier hosting providers (Render, Koyeb) automatically spin down instances after 15 minutes of inbound HTTP inactivity. The next request triggers a 30–50s cold start.

### Frontend Implementation ([frontend/components/api-status.tsx](file:///s:/Cortexdesk/frontend/components/api-status.tsx))
To provide a smooth, transparent user experience:

1. **Delayed Indicator**:
   - For fast requests (< 2.0s), displays standard `"API: checking..."` and transitions straight to `"API: connected"`.
   - If the request takes longer than 2.0s, smoothly transitions to an animated amber pulse:
     `"Waking up the server…"`
2. **Duplicate Request Prevention**:
   - Uses an internal in-flight reference guard (`inFlightRef`) to prevent redundant concurrent health probes.
3. **Cancellation & Clean Timeout**:
   - Bounded 45-second timeout via `AbortController` prevents hanging network connections.
   - Automatically aborts pending requests on component unmount to prevent state updates on unmounted elements.
4. **Failure Disambiguation**:
   - Network failure / timeout -> `"API: unavailable"`
   - Server HTTP 5xx/4xx error -> `"API: error (500)"`
   - Never masks network errors or cold-start timeouts as authenticated states.
5. **Interactive Retry Action**:
   - Provides an accessible `"Retry"` button when in an error or unavailable state.

---

## 📋 8. Production Integration Verification Checklist

When both frontend and backend deployments are live:

- [ ] **Step 1: Discover URLs**: Record verified production frontend domain and backend URL.
- [ ] **Step 2: Connect Frontend to Backend**: In Vercel, set `NEXT_PUBLIC_API_URL` to the live backend URL and trigger a redeploy.
- [ ] **Step 3: Connect Backend to Frontend**: In Render, set `CORS_ORIGINS` to the Vercel production domain.
- [ ] **Step 4: Verify Supabase Redirects**: Confirm Site URL and Redirect URLs are saved in the Supabase Dashboard.
- [ ] **Step 5: Test OAuth Login**: Click "Sign in with GitHub" on production; verify the browser redirects back to the production domain (`/dashboard`) and not localhost.
- [ ] **Step 6: Network Inspection**: In browser Developer Tools Network tab:
  - Verify calls to `/health` return HTTP 200 with `access-control-allow-origin`.
  - Verify calls to `/projects` attach `Authorization: Bearer <jwt>` and return user data.
  - Verify that requests from an unauthorized origin receive no CORS allow header.
- [ ] **Step 7: Sign-Out Verification**: Click Logout on the dashboard; confirm the user session is revoked and redirection to `/login` occurs.

---

## 🔧 9. Production Integration Troubleshooting Guide

| Problem / Error | Root Cause | Resolution & Verification |
| :--- | :--- | :--- |
| **`exchange_code_failed` during OAuth callback** | 1. Next.js middleware clears PKCE code-verifier cookie prior to exchange.<br>2. GitHub OAuth App points to Vercel instead of Supabase.<br>3. Mismatched redirect URL in Supabase dashboard. | • Verify `frontend/proxy.ts` bypasses `/auth` routes to preserve `sb-*-code-verifier` cookies.<br>• Verify GitHub OAuth App callback URL is strictly `https://<ref>.supabase.co/auth/v1/callback`.<br>• Verify Supabase Redirect URLs includes `https://<frontend-domain>/auth/callback`. |
| **`No 'Access-Control-Allow-Origin' header` (CORS)** | 1. Trailing slash in `CORS_ORIGINS` (e.g., `https://cortexdesk.vercel.app/`).<br>2. Missing scheme (e.g., `cortexdesk.vercel.app`).<br>3. Request uses wildcard `*` with credentials. | • Configure `CORS_ORIGINS` with exact protocol and domain, no trailing slash (e.g. `https://cortexdesk.vercel.app`).<br>• `backend/config.py` automatically strips trailing slashes and rejects wildcards.<br>• Test preflight with: `curl -I -X OPTIONS https://<api-url>/health -H "Origin: https://<frontend-domain>"` |
| **"API: unavailable" / Cold-Start Delay** | Render/Koyeb free-tier instances spin down after 15 min of inactivity, requiring 30–50s to reboot. | • The frontend `ApiStatus` component automatically shows `"Waking up the server…"` after 2.0s.<br>• Requests are bounded to a 45s timeout.<br>• Click the accessible `"Retry"` button once the instance spins up. |
| **`Invalid Refresh Token: Refresh Token Not Found`** | Stale session cookie in browser after user was deleted or token revoked. | • `frontend/proxy.ts` traps `refresh_token_not_found` and safely clears expired `sb-*` session cookies, redirecting cleanly to `/login`. |
| **401 Unauthorized on `/projects`** | Missing or malformed `Authorization: Bearer <token>` header in API calls. | • Confirm client uses `createBrowserClient` to acquire session token.<br>• Confirm API client wrapper attaches `Bearer ${session.access_token}`.<br>• Verify token audience is `authenticated`. |

---

## 🎯 10. Task 1.4.6 Acceptance Criteria & Verification Status

| Requirement | Implementation Artifact | Status | Verification Detail |
| :--- | :--- | :---: | :--- |
| **1. Discover actual deployment URLs** | [docs/deployment.md](file:///s:/Cortexdesk/docs/deployment.md) | **BLOCKED** | Ready for user-provided live production URLs; no placeholder/invented domains used in code. |
| **2. Narrowly scoped Supabase redirects** | Supabase Dashboard URL settings | **BLOCKED** | Configuration documented: Site URL = Vercel origin; Redirect URL = `/auth/callback`; GitHub App = Supabase `/auth/v1/callback`. Remote dashboard change requires user execution. |
| **3. Production CORS configuration** | [backend/config.py](file:///s:/Cortexdesk/backend/config.py) | **VERIFIED** | Enforces exact origins; strips wildcards; trims trailing slashes; supports credentials; separates local dev. |
| **4. Cold-start resilience UX** | [frontend/components/api-status.tsx](file:///s:/Cortexdesk/frontend/components/api-status.tsx) | **VERIFIED** | 2.0s delayed `"Waking up the server…"`; bounded 45s timeout; duplicate suppression; accessible retry button. |
| **5. PKCE OAuth verifier protection** | [frontend/proxy.ts](file:///s:/Cortexdesk/frontend/proxy.ts) | **VERIFIED** | Preserves `sb-*-code-verifier` during `/auth` routes; logs exchange errors; blocks open redirect exploits. |
| **6. Least-privilege DB security** | [backend/db.py](file:///s:/Cortexdesk/backend/db.py) | **VERIFIED** | Uses user-scoped PostgREST client with caller's Bearer JWT and anon key; zero `service_role` usage. |
| **7. Production integration testing** | Live environments | **BLOCKED** | Remote end-to-end testing against live third-party dashboards blocked pending user cloud deployment. |
