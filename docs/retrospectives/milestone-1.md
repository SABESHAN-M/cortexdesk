# Milestone 1 Retrospective — CortexDesk

**Project**: CortexDesk Monorepo  
**Milestone**: Milestone 1 (Foundation, Authentication, Core API, and Deployment Baseline)  
**Author / Role**: Release Engineer & Core Team  
**Date**: October 25, 2026  

---

## 1. Executive Summary

Milestone 1 established the operational, architectural, and security foundation for CortexDesk. This encompassed the monorepo structure, Supabase PostgreSQL schema with Row Level Security (RLS), FastAPI backend with asymmetric JWT verification, Next.js 16 frontend with Tailwind CSS and SSR authentication, GitHub Actions CI/CD workflows, branch protection gates, containerization, and cloud deployment architecture for Vercel and Render/Koyeb.

All core foundational deliverables have been implemented, tested locally and in CI, hardened against OWASP top vulnerabilities, and validated for release readiness.

---

## 2. What Took Longer Than Expected and Why

1. **React 19 & Next.js 16 Compiler / Linter Strictness (`react-hooks/set-state-in-effect`)**:
   - *Challenge*: The newly introduced ESLint rule in `eslint-plugin-react-hooks` v5 strictly forbids calling `setState` synchronously within the body of a `useEffect` or directly inside synchronous functions called at the root of an effect.
   - *Impact*: In the `ApiStatus` component, attempting to initialize the `"checking"` state synchronously on mount triggered CI lint failures.
   - *Solution*: Refactored `ApiStatus` to decouple user-initiated retries from effect-based lifecycle subscriptions, using `.then()`/`.catch()` asynchronous callbacks exclusively for effect state transitions.

2. **Windows Shell & Tooling Environment Nuances**:
   - *Challenge*: The absence of a pre-authenticated `gh` CLI binary in the local Windows environment prevented standard CLI script execution for branch protection inspection and pull request creation.
   - *Impact*: Direct CLI automation scripts failed with command-not-found errors.
   - *Solution*: Developed resilient PowerShell scripts utilizing Windows Git Credential Manager tokens and GitHub REST v3/v4 API calls directly (`Invoke-RestMethod`), ensuring fully automated and repeatable execution.

3. **Branch Protection & Code Owner Enforcement Validation**:
   - *Challenge*: Verifying the strict merge gate required orchestrating intentional failure scenarios without leaving the repository in a broken state or violating the branch constraint (`main` and `sabeshan` only).
   - *Impact*: Required executing live pull request tests (PR #1 and PR #2) against the remote GitHub API to prove that 405 Method Not Allowed blocks occurred when CI failed or when Code Owner approval (`@sabeshan-m`) was pending.

---

## 3. What Worked Well

1. **Zero-Trust User-Scoped Database Client (`backend/db.py`)**:
   - Rather than relying on a high-privilege `service_role` key in backend code, the architecture generates user-scoped Supabase PostgREST clients dynamically using the caller's verified Bearer JWT and the public anon key (`create_user_scoped_client`).
   - This ensures PostgreSQL Row Level Security (RLS) is cryptographically enforced by the database engine on every query, rendering privilege escalation impossible from the application tier.

2. **Astral `uv` for Python Tooling**:
   - Dependency locking, installation, and pytest execution using `uv` executed consistently in under 4 seconds (`uv lock --check` in 2ms; 46 pytest tests in 3.2s).
   - Lockfile consistency verification in CI completely eliminated Python environment divergence issues.

3. **Hermetic CI & Asymmetric JWT Verification**:
   - The test suite utilizes ephemeral RSA/ECDSA key pairs and synthetic JWT tokens to test expired tokens, invalid signatures, audience mismatch, and tenant isolation without requiring external network calls or a running Supabase instance during CI.

4. **Cold-Start Resilience UX**:
   - A dedicated `ApiStatus` indicator with a 2-second grace period prevents flashing error banners on Render free-tier cold starts, smoothly presenting `"Waking up the server…"` and providing an accessible retry button with duplicate request suppression.

---

## 4. Issues Discovered Through CI/CD and Deployment Setup

1. **Monorepo Directory Isolation on Vercel**:
   - By default, Vercel attempts to detect root-level configurations. Configuring **Root Directory: `frontend`** and `npm ci` was essential to prevent build failures looking for root Next.js configuration files.

2. **Render Dynamic Port Binding**:
   - Standard Docker containers and native Python services on Render inject a dynamic `$PORT` environment variable. Hardcoded port `8000` failed container health probes. Updating the container command to bind `0.0.0.0:$PORT` solved all routing issues.

3. **CORS Origin Normalization**:
   - Trailing slashes in origin URLs (e.g., `https://cortexdesk.vercel.app/`) cause browser CORS preflight rejections. The backend configuration was hardened to strip trailing slashes, trim whitespace, and reject open wildcards (`*`).

4. **Open-Redirect Vulnerabilities in Auth Callback**:
   - Next.js authentication callback routes that blindly redirect to `next` search parameters expose users to phishing. Implementing `getSafeRedirectPath()` restricted redirections strictly to relative paths matching `^/[a-zA-Z0-9/_-]*$`.

---

## 5. Improvements to Repository Structure and Workflow

1. **Protected Main Branch & Code Ownership**:
   - Enforced `.github/CODEOWNERS` requiring `@sabeshan-m` approval.
   - Enforced required CI status checks (`Frontend Lint & Build` and `Backend Tests & Lockfile Check`) before merge.
   - Enforced `strict: true` (branches must be up to date before merging).

2. **Pruned Remote References**:
   - Purged stale and abandoned remote tracking branches, standardizing the repository on `main` (production baseline) and `sabeshan` (active feature development).

3. **Centralized Architectural Documentation**:
   - Consolidated technical specifications in `docs/`:
     - `docs/PROJECT_BLUEPRINT.md`
     - `docs/architecture.md`
     - `docs/api-contract.md`
     - `docs/deployment.md`
     - `docs/security.md`
     - `docs/retrospectives/milestone-1.md`

---

## 6. Staging Environment Proposal & Architecture

To support continuous delivery for Milestone 2 without risking production disruptions or test data contamination, a dedicated Staging Environment is proposed.

### Staging Architecture Sketch

```mermaid
flowchart TD
    subgraph VCS ["GitHub Repository (cortexdesk)"]
        MainBranch["Branch: main (Production)"]
        FeatureBranch["PR: feature/* (Staging / Preview)"]
    end

    subgraph StagingEnv ["Staging Environment"]
        VercelPreview["Vercel Preview Deployment\n(cortexdesk-preview-*.vercel.app)"]
        RenderStaging["Render Staging API\n(cortexdesk-api-staging.onrender.com)"]
        SupabaseStaging["Supabase Staging Project\n(project-staging.supabase.co)"]
    end

    subgraph ProdEnv ["Production Environment"]
        VercelProd["Vercel Production\n(cortexdesk.vercel.app)"]
        RenderProd["Render Production API\n(cortexdesk-api.onrender.com)"]
        SupabaseProd["Supabase Production Project\n(hcliddnesvmfbywphcvt.supabase.co)"]
    end

    FeatureBranch -->|Deploy on PR| VercelPreview
    FeatureBranch -->|Deploy on Staging Merge| RenderStaging
    VercelPreview -->|API Calls (CORS)| RenderStaging
    RenderStaging -->|Auth & Scoped DB| SupabaseStaging

    MainBranch -->|Auto Deploy on Merge| VercelProd
    MainBranch -->|Auto Deploy on Merge| RenderProd
    VercelProd -->|API Calls (CORS)| RenderProd
    RenderProd -->|Auth & Scoped DB| SupabaseProd
```

### Staging Isolation Principles
1. **Isolated Data Tier**: Staging must use a distinct Supabase project. Migration scripts (`supabase/migrations/*.sql`) run against staging first.
2. **Distinct Auth Redirects**: Staging Supabase project whitelist contains only `https://cortexdesk-*-staging.vercel.app/auth/callback`.
3. **CORS Boundary**: Staging API accepts requests only from Vercel preview origins and localhost.

---

## 7. Staging vs Production Environment Configuration

The following table documents the exact environment variable schema for Staging versus Production environments. **No secret values are included.**

| Component | Variable Name | Staging Value Pattern | Production Value Pattern | Sensitivity |
| :--- | :--- | :--- | :--- | :---: |
| **Frontend** | `NEXT_PUBLIC_APP_NAME` | `CortexDesk (Staging)` | `CortexDesk` | Public |
| **Frontend** | `NEXT_PUBLIC_API_URL` | `https://cortexdesk-api-staging.onrender.com` | `https://cortexdesk-api.onrender.com` | Public |
| **Frontend** | `NEXT_PUBLIC_SUPABASE_URL` | `https://<staging-ref>.supabase.co` | `https://hcliddnesvmfbywphcvt.supabase.co` | Public |
| **Frontend** | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_staging_<token>` | `sb_publishable_<token>` | Public / Client |
| **Backend** | `APP_NAME` | `cortexdesk` | `cortexdesk` | Non-sensitive |
| **Backend** | `APP_ENV` | `staging` | `production` | Non-sensitive |
| **Backend** | `SUPABASE_URL` | `https://<staging-ref>.supabase.co` | `https://hcliddnesvmfbywphcvt.supabase.co` | Non-sensitive |
| **Backend** | `SUPABASE_ANON_KEY` | `sb_publishable_staging_<token>` | `sb_publishable_<token>` | Server-side public |
| **Backend** | `SUPABASE_JWT_AUDIENCE` | `authenticated` | `authenticated` | Configuration |
| **Backend** | `CORS_ORIGINS` | `https://cortexdesk-staging.vercel.app` | `https://cortexdesk.vercel.app` | Configuration |
| **Supabase** | `Site URL` | `https://cortexdesk-staging.vercel.app` | `https://cortexdesk.vercel.app` | Dashboard Config |
| **Supabase** | `Redirect URLs` | `https://cortexdesk-staging.vercel.app/auth/callback` | `https://cortexdesk.vercel.app/auth/callback` | Dashboard Config |
| **GitHub App**| `Authorization callback URL` | `https://<staging-ref>.supabase.co/auth/v1/callback` | `https://hcliddnesvmfbywphcvt.supabase.co/auth/v1/callback` | Dashboard Config |

---

## 8. Actionable Improvements for Milestone 2

1. **Automated Database Migration Pipeline**:
   - Integrate `supabase db push` or migration validation into GitHub Actions so that SQL migrations in `supabase/migrations/` are applied automatically to Staging on merge.
2. **End-to-End Playwright Automation**:
   - Implement headless Playwright browser tests in CI that test the real authentication handshake, session storage, and project CRUD operations against ephemeral preview environments.
3. **API Rate Limiting & Abuse Prevention**:
   - Implement in-memory or Redis-backed sliding window rate limiting on FastAPI endpoints (`/projects`, `/health`) to protect against brute-force or denial-of-service attempts.
4. **Health Check Latency Instrumentation**:
   - Add response timing headers (`X-Response-Time`) to `/health` to allow frontend performance telemetry and better inform cold-start thresholds.
5. **Preview Deployment Teardown**:
   - Automate pruning of ephemeral Vercel preview environments and preview database branches upon PR closure.
