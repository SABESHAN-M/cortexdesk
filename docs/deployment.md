# CortexDesk Frontend Deployment Guide (Vercel)

This document provides the canonical production deployment configuration, environment specifications, operational procedures, and self-deployment instructions for deploying the CortexDesk Next.js frontend to Vercel from this monorepo.

---

## 🚦 Deployment Status & Merge Gate Alignment

| Status Component | State | Notes |
| :--- | :--- | :--- |
| **Monorepo Readiness** | **VERIFIED** | `frontend/` builds 100% independently (`next build` compiled 8 routes with 0 errors) |
| **Secret Hygiene** | **VERIFIED** | Zero privileged secrets in frontend code or build configurations |
| **CI Merge Gate (Task 1.4.3)** | **ENFORCED** | Required checks: `Frontend lint and build`, `Backend tests`, CODEOWNERS PM review |
| **Remote Vercel Deployment** | **PENDING USER SELF-DEPLOYMENT (BLOCKED)** | Automated remote trigger deferred per user direction; manual procedure documented below |
| **Production URL** | *Pending manual deployment* | Documented only after verification |

---

## 🏛 1. Vercel Project Configuration

CortexDesk is structured as a monorepo. Vercel must be configured to build exclusively from the `frontend/` subdirectory while preserving root repository governance.

### Core Project Settings

| Setting | Configuration Value | Notes |
| :--- | :--- | :--- |
| **Project Name** | `cortexdesk` (or `cortexdesk-frontend`) | Recommended naming convention |
| **Framework Preset** | **Next.js** | Automatically detects Next.js App Router (v16.3+) |
| **Root Directory** | `frontend` | **Crucial**: Directs the Vercel build container into the frontend package |
| **Build Command** | `npm run build` (or leave default `next build`) | Compiles optimized Next.js bundle |
| **Output Directory** | `.next` (default) | Standard Next.js build output |
| **Install Command** | `npm ci` | Enforces exact dependencies from `frontend/package-lock.json` |
| **Node.js Version** | **22.x** (or `>= 20.0.0`) | Matches monorepo engine requirements |
| **Production Branch** | `main` | Automatic production deployments triggered on push to `main` |

> [!IMPORTANT]
> Do not move the frontend into a separate repository or alter the root-level repository structure. Setting **Root Directory: `frontend`** in Vercel preserves monorepo structure, tooling, and root GitHub Actions workflows.

---

## 🔑 2. Environment Variables Specification

The frontend requires client-safe public variables prefixed with `NEXT_PUBLIC_`. These must be configured in the Vercel Dashboard under **Project Settings → Environment Variables** for **Production** and **Preview** environments.

### Required Variables

| Variable Name | Environments | Description | Example / Placeholder |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_NAME` | Production, Preview | Application display name | `cortexdesk` |
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview | Supabase project API gateway | `https://<your-project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Production, Preview | Supabase client-safe anonymous/publishable key | `eyJhbGci...` |
| `NEXT_PUBLIC_API_URL` | Production, Preview | FastAPI backend service endpoint | `https://api-placeholder.cortexdesk.internal` *(Placeholder until Task 1.4.5)* |

### ⚠️ Secret Hygiene & Security Boundaries
- **NEVER** configure `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, database passwords (`DATABASE_URL`), or LLM API keys in Vercel project environment variables.
- All frontend runtime configuration is strictly limited to public `NEXT_PUBLIC_*` variables.
- Backend secrets are managed independently in the backend deployment environment (Task 1.4.5).
- Do not mark the deployment as fully integrated until Task 1.4.5 establishes the live backend service.

---

## 🚀 3. Self-Deployment Procedures

### Option A: Via Vercel Web Dashboard (Recommended for Git Integration)

1. **Log in to Vercel**: Visit [vercel.com](https://vercel.com) and navigate to your dashboard.
2. **Import Repository**:
   - Click **Add New...** → **Project**.
   - Search for and select repository `SABESHAN-M/cortexdesk`.
3. **Configure Project Settings**:
   - **Project Name**: `cortexdesk`
   - **Framework Preset**: `Next.js`
   - **Root Directory**: Click **Edit**, select `frontend`, and click **Continue**.
   - **Build and Output Settings**:
     - Build Command: leave default (`next build` / `npm run build`)
     - Output Directory: leave default (`.next`)
     - Install Command: override to `npm ci`
4. **Configure Environment Variables**:
   Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_APP_NAME` = `cortexdesk`
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your Supabase public Anon Key
   - `NEXT_PUBLIC_API_URL` = `https://api-placeholder.cortexdesk.internal`
5. **Trigger Deployment**:
   - Click **Deploy**.
   - Wait for the build to complete (~30–45s).

### Option B: Via Vercel CLI

```bash
# 1. Log in to Vercel CLI
vercel login

# 2. Link repository root (monorepo mode)
vercel link --repo

# 3. Add environment variables
echo "https://your-project.supabase.co" | vercel env add NEXT_PUBLIC_SUPABASE_URL production preview
echo "your-anon-key" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production preview
echo "https://api-placeholder.cortexdesk.internal" | vercel env add NEXT_PUBLIC_API_URL production preview
echo "cortexdesk" | vercel env add NEXT_PUBLIC_APP_NAME production preview

# 4. Deploy Preview build
vercel deploy frontend --no-wait

# 5. Deploy Production build (after verifying preview)
vercel deploy frontend --prod
```

---

## 🔄 4. Preview Deployment & Branch Lifecycle

- **Pull Requests**: When the GitHub repository is integrated with Vercel, every pull request targeting `main` automatically receives an isolated Preview Deployment with its own unique URL (e.g., `https://cortexdesk-git-<branch>-<team>.vercel.app`).
- **Supabase Authentication Whitelist**:
  - In the Supabase Dashboard, navigate to **Authentication → URL Configuration → Redirect URLs**.
  - Add wildcard redirect URL for Vercel preview environments:
    ```
    https://*-<team-slug>.vercel.app/auth/callback
    ```
  - Add your production URL once assigned:
    ```
    https://cortexdesk.vercel.app/auth/callback
    ```

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

## 📋 6. Verification Checklist for Self-Deployment

Once deployed, perform the following verification steps:
- [ ] **Homepage Render**: Open production URL in a browser and confirm the landing/login view loads cleanly with styling.
- [ ] **Console Cleanliness**: Open browser Developer Tools to confirm no uncaught runtime exceptions or leaked secrets.
- [ ] **Preview Deployment**: Open a temporary test pull request on GitHub to confirm a preview deployment URL is posted by the Vercel bot.
- [ ] **Deployment Log Audit**: Verify in Vercel build and function logs that no tokens or secret keys are logged.
- [ ] **Record Production URL**: Update this file with the final assigned production domain.
