# CortexDesk Frontend Deployment Guide (Vercel)

This document provides the canonical production deployment configuration, environment specifications, and operational procedures for deploying the CortexDesk Next.js frontend to Vercel from this monorepo.

---

## 🏛 1. Vercel Project Configuration

CortexDesk is structured as a monorepo. Vercel must be configured to build exclusively from the `frontend/` subdirectory while preserving root repository governance.

### Core Project Settings

| Setting | Configuration Value | Notes |
| :--- | :--- | :--- |
| **Project Name** | `cortexdesk` (or `cortexdesk-frontend`) | Recommended naming convention |
| **Framework Preset** | **Next.js** | Automatically detects Next.js App Router (v16) |
| **Root Directory** | `frontend` | **Crucial**: Points build pipeline to the frontend package |
| **Build Command** | `npm run build` (or leave default `next build`) | Compiles optimized Next.js bundle |
| **Output Directory** | `.next` (default) | Standard Next.js build output |
| **Install Command** | `npm ci` | Enforces exact dependencies from `frontend/package-lock.json` |
| **Node.js Version** | **22.x** (or `>= 20.0.0`) | Matches monorepo engine requirements |
| **Production Branch** | `main` | Automatic production deployments triggered on push to `main` |

---

## 🔑 2. Environment Variables Specification

The frontend requires client-safe public variables prefixed with `NEXT_PUBLIC_`. These must be configured in the Vercel Dashboard under **Project Settings → Environment Variables** for **Production**, **Preview**, and **Development** environments.

### Required Variables

| Variable Name | Environments | Description | Example / Placeholder |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Production, Preview | Application display name | `cortexdesk` |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Supabase project API gateway | `https://<your-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Supabase client-safe anonymous/publishable key | `eyJhbGci...` |
| `NEXT_PUBLIC_API_URL` | Production, Preview | FastAPI backend service endpoint | `https://api.cortexdesk.internal` *(Placeholder until Task 1.4.5)* |

### ⚠️ Secret Hygiene & Security Boundaries
- **NEVER** configure `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, database passwords (`DATABASE_URL`), or LLM API keys in Vercel project environment variables.
- All frontend runtime configuration is strictly limited to public `NEXT_PUBLIC_*` variables.
- Backend secrets are managed independently in the backend deployment environment (Task 1.4.5).

---

## 🚀 3. Deployment Workflows

### Method A: Git Integration (Recommended)
1. In the Vercel Dashboard, click **Add New → Project**.
2. Select the GitHub repository: `SABESHAN-M/cortexdesk`.
3. In **Root Directory**, click **Edit** and select `frontend`.
4. Leave Framework Preset as **Next.js**.
5. Expand **Environment Variables** and add the required variables listed above.
6. Click **Deploy**.

### Method B: Vercel CLI (Token / Automated)
If deploying via command line or CI pipeline with a personal access token (`VERCEL_TOKEN`):

```bash
# 1. Link project from repository root
vercel link --repo --scope <your-team-slug> -y

# 2. Add environment variables
echo "https://your-project.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production preview
echo "your-anon-key" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production preview
echo "http://localhost:8000" | vercel env add NEXT_PUBLIC_API_URL production preview

# 3. Deploy Preview
vercel deploy frontend -y --no-wait

# 4. Deploy Production (after explicit verification)
vercel deploy frontend --prod -y
```

---

## 🔄 4. Preview Deployment & Branch Lifecycle

- **Pull Requests**: Every pull request targeting `main` automatically triggers an isolated Vercel Preview Deployment.
- **Preview URLs**: Each preview deployment receives a unique URL (e.g. `https://cortexdesk-git-<branch>-<team>.vercel.app`).
- **Supabase Redirect Whitelist**:
  - If testing authentication on preview deployments, wildcard redirect URLs or specific preview domains must be configured in the Supabase Dashboard under **Authentication → URL Configuration → Redirect URLs** (e.g. `https://*-<team>.vercel.app/auth/callback`).

---

## 🛠 5. Rollback & Troubleshooting Procedures

### Instant Rollback
If an unhealthy build is deployed to production:
1. Open Vercel Dashboard → **Deployments**.
2. Locate the previous healthy deployment.
3. Click the three dots (`...`) → **Instant Rollback**.
4. Traffic is immediately redirected to the previous immutable build artifact within seconds.

### Common Build & Runtime Issues
1. **Build Failure: Missing Environment Variables**:
   - *Symptom*: Build fails during page data collection with `Missing NEXT_PUBLIC_SUPABASE_URL`.
   - *Fix*: Ensure all `NEXT_PUBLIC_*` variables are defined for the corresponding environment (Production or Preview) in Vercel settings.
2. **Monorepo Directory Mismatch**:
   - *Symptom*: Build fails with `Cannot find package.json` or attempts to run root scripts.
   - *Fix*: Verify that Root Directory is explicitly set to `frontend` in Project Settings → General.
3. **CORS / API Connection Failures**:
   - *Symptom*: Browser reports CORS error when contacting backend.
   - *Fix*: Verify backend `CORS_ORIGINS` includes the deployed Vercel domain (`https://cortexdesk.vercel.app` or preview domain).

---

## 📋 6. Deployment Verification Record

- **Monorepo Subdirectory Target**: `frontend/` (Verified independently via local build)
- **Production Build Status**: Verified locally (`next build` compiled 8 routes in 2.9s)
- **Live Vercel Hosted Status**: Awaiting Vercel account authorization / token link
- **Production Domain**: `https://cortexdesk.vercel.app` (Subject to live project provisioning)
