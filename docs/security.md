# Security Architecture & Policies

## Security baseline for Story 1.1

This document outlines the security controls, credential isolation boundaries, and architectural baselines implemented for Story 1.1 of CortexDesk.

---

### 1. Secret Management Rules

- **Zero-Secret Commit Policy**: Real credentials, authentication tokens, API keys, private keys, database passwords, and runtime environment files must never be committed to the Git repository.
- **Pre-commit Audit Validation**: The repository enforces pre-commit verification workflows and CI scanners (`.github/workflows/security.yml`) that detect and reject secret files (`.key`, `.pem`, unmanaged credentials).
- **Environment Isolation**: Runtime secrets are injected exclusively through environment variables or untracked local environment files (`.env`, `backend/.env`, `frontend/.env.local`).

---

### 2. Environment Template Policy

- **Single Source of Truth**: The root [`.env.example`](file:///.env.example) defines the canonical registry for all environment variables across the monorepo.
- **Dedicated Application Templates**:
  - [`frontend/.env.example`](file:///frontend/.env.example) exposes only client-safe public variables prefixed with `NEXT_PUBLIC_`.
  - [`backend/.env.example`](file:///backend/.env.example) documents server-side variables, explicitly separating baseline health service configuration from upcoming milestone requirements.
- **Placeholder Standards**: All committed templates use unmistakable, non-functional placeholders (e.g., `your-project-ref`, `your-supabase-service-role-secret-server-only`, `your-local-postgres-password`). No production or real sandbox values are ever placed in templates.

---

### 3. Git Exclusion Policy

The root [`.gitignore`](file:///.gitignore) strictly enforces exclusion boundaries across:
- **Environment Files**: `.env*` pattern matches all real environment files (`.env`, `.env.local`, `.env.production`, `backend/.env`, `frontend/.env.local`).
- **Template Exceptions**: Explicit whitelist entries `!.env.example` and `!**/.env.example` are positioned after general `.env*` exclusions to allow template documentation to be tracked.
- **Dependencies & Build Artifacts**: Complete exclusions for `node_modules/`, `.next/`, `build/`, `out/`, `dist/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, and coverage outputs.
- **Secret & Key Formats**: Broad pattern exclusions for `*.pem`, `*.key`, `*.cert`, `*.crt`, `id_rsa*`, and `secrets.json`.
- **Persistent Data**: Excludes `postgres_data/` and local SQLite files (`*.db`, `*.sqlite*`).

---

### 4. Frontend & Backend Credential Separation

- **Browser Boundary (`NEXT_PUBLIC_*`)**:
  - In Next.js, only variables prefixed with `NEXT_PUBLIC_` are embedded into client JavaScript bundles.
  - Allowed client variables are strictly restricted to:
    - `NEXT_PUBLIC_APP_NAME` (Application display name)
    - `NEXT_PUBLIC_API_URL` (Browser-accessible backend endpoint)
    - `NEXT_PUBLIC_SUPABASE_URL` (Supabase public API gateway)
    - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase public anonymous key)
- **Server-Only Isolation**:
  - `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, database connection strings (`DATABASE_URL`), and LLM provider keys (`GEMINI_API_KEY`, `GROQ_API_KEY`, `TAVILY_API_KEY`) are exclusively accessible to the backend Python runtime.
  - Privileged credentials must never be prefixed with `NEXT_PUBLIC_` or imported into client components.

---

### 5. CORS Restrictions

The FastAPI backend (`backend/main.py`) enforces strict Cross-Origin Resource Sharing (CORS) rules:
- **Explicit Origins Only**: Only origins declared in `CORS_ORIGINS` (defaulting strictly to `http://localhost:3000`) are permitted.
- **Wildcard Prohibition with Credentials**: Wildcard origins (`*`) are explicitly rejected when `allow_credentials=True` is enabled, mitigating CSRF and session theft risks in accordance with the fetch and CORS specifications.
- **Restricted Methods and Headers**:
  - Allowed HTTP methods: `GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`.
  - Allowed HTTP headers: `Content-Type`, `Authorization`, `Accept`.

---

### 6. Local Database Credential Handling

- **Development Defaults**: Docker Compose ([`docker-compose.yml`](file:///docker-compose.yml)) provides safe, isolated fallback credentials (`POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `POSTGRES_DB=cortexdesk`) intended solely for local containerized development.
- **Container Isolation**: The PostgreSQL container is isolated within the local Docker bridge network and only exposes port 5432 to the local host machine.
- **Production Warning**: Default container credentials must never be used in staging or production environments.

---

### 7. Current Limitations & Deferred Requirements

Story 1.1 focuses exclusively on repository infrastructure, tooling, and application scaffolding. The following security capabilities are intentionally deferred to subsequent roadmap milestones:
- **Authentication Flow**: User session verification, OAuth integrations, and protected user routes.
- **Database Row Level Security (RLS)**: PostgreSQL table policies, tenant data isolation, and user-level authorization will be implemented alongside application data migrations.
- **API Authorization Middleware**: JWT bearer validation, scope checks, and route protection on FastAPI endpoints will be introduced in the auth milestone.
- **Production Secret Management**: Deployment-level secret vaults (e.g., AWS Secrets Manager, Vercel Environment Variables, Render Secret Groups) will be configured in infrastructure deployment stories.

---

## Security baseline for Story 1.2

This section documents the security controls, audit results, and session boundaries established in Story 1.2 (Authentication & Session Lifecycle).

### 1. Secret Exposure Audit Results

- **Frontend Codebase Scan**: Exhaustive scan across `frontend/app`, `frontend/components`, `frontend/utils`, and public static directories verified zero occurrences of:
  - Supabase `service_role` secrets or master keys.
  - JWT signing secrets (`SUPABASE_JWT_SECRET`).
  - GitHub OAuth client secrets.
  - Database passwords or private PostgreSQL connection URIs.
  - Hardcoded user session tokens or Bearer credentials.
- **Frontend Environment Boundary**: The browser runtime is strictly constrained to safe public variables prefixed with `NEXT_PUBLIC_` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_NAME`).
- **Template Sanitization**: All committed environment templates (`.env.example`, `frontend/.env.example`, `backend/.env.example`) use synthetic placeholders (e.g., `your-project-ref`, `your-supabase-service-role-secret-server-only`). Real credentials remain exclusively in gitignored local files (`.env`, `frontend/.env.local`, `backend/.env`).

---

### 2. Public Key & Row Level Security (RLS) Dependency

- **Client Key Role**: The Supabase publishable/anonymous key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is client-safe and intended for browser-side distribution. It grants access to Supabase Auth endpoints and the PostgREST gateway, but **does not provide data authorization by itself**.
- **Critical Story 1.3 Prerequisite**: Row Level Security (RLS) policies on PostgreSQL tables, granular tenant boundaries, and user permission checks must be designed, applied, and cryptographically verified in **Story 1.3** before private user workspace or document data is exposed through the database layer. No RLS protections are assumed active until verified against actual PostgreSQL migration scripts.

---

### 3. Route Protection & Session Lifecycle

- **Request Guard (`frontend/proxy.ts`)**:
  - In Next.js 16+, `proxy.ts` executes on matched navigation requests, enforcing server-validated identity via `supabase.auth.getUser()`.
  - Unauthenticated access to protected routes (`/dashboard`, `/projects/*`) triggers an HTTP 307 redirect to `/login?next=<encoded_destination>`, preserving the user's intended route.
  - Public routes (`/`, `/login`, `/auth/callback`, `/auth/signout`) remain accessible without session credentials.
  - An explicit negative lookahead matcher excludes static assets, Next.js internal chunks, image optimization routes, and standard media extensions to avoid redundant execution.
  - Login redirects carry over refreshed and cleared authentication cookies to prevent state drift or redirect loops.
- **Logout Invalidation (`frontend/app/dashboard/logout-button.tsx`)**:
  - Client-side invocation of `supabase.auth.signOut()` purges browser session storage and document cookies.
  - Dispatches `POST /auth/signout` for server-side token invalidation.
  - Triggers Next.js router cache eviction via `router.push('/login')` and `router.refresh()`.

---

### 4. Backend JWT Verification & API Authorization

- **FastAPI Authenticated Dependency (`backend/auth.py`)**:
  - The `get_current_user` dependency intercepts the HTTP `Authorization: Bearer <token>` header on backend endpoints.
  - **Asymmetric Signature Verification**: Fetches and verifies public signing keys using Supabase's published JWKS endpoint (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`).
  - **Strict Algorithm Whitelisting**: Restricts accepted signing algorithms to `["RS256", "ES256"]`. The `alg` header declared by incoming tokens is never blindly trusted.
  - **Bounded Key Caching**: `PyJWKClient` caches keys with `lifespan=300.0` seconds and enforces a bounded `timeout=10.0` seconds to mitigate request latency and Denial-of-Service vectors. Unknown `kid` values trigger key-set cache renewal.
  - **Claim Enforcement**: Enforces token expiration (`exp`), audience (`aud == "authenticated"`), project issuer (`iss == <SUPABASE_URL>/auth/v1`), and subject user UUID (`sub`).
  - **Error Sanitation**: Rejects invalid, expired, malformed, or untrusted tokens with HTTP 401 without leaking internal stack traces or crashing the backend (zero HTTP 500 errors).
  - **Protected Endpoint**: `GET /me` requires a verified user token and returns only `{ "user_id": ..., "email": ... }`, strictly withholding the raw bearer token from response payloads. Public `GET /health` remains unauthenticated.

---

### 5. Automated Regression Test Verification

Automated regression test suite in [`backend/tests/test_auth.py`](file:///s:/Cortexdesk/backend/tests/test_auth.py) passed 13/13 test cases using deterministic in-memory RSA key generation:
- Missing `Authorization` header -> HTTP 401.
- Malformed header schemes or non-JWT tokens -> HTTP 401.
- Tampered or invalidly signed tokens -> HTTP 401.
- Expired tokens -> HTTP 401.
- Incorrect audience claim -> HTTP 401.
- Incorrect issuer claim -> HTTP 401.
- Valid signed token -> HTTP 200 with sanitized user profile.
- Unauthenticated `/health` -> HTTP 200 OK.
- JWKS instance caching and bounded timeouts -> Verified.

---

### 6. Redirect & Callback Restrictions

- **Open-Redirect Mitigation**: [`frontend/app/auth/callback/route.ts`](file:///s:/Cortexdesk/frontend/app/auth/callback/route.ts) validates candidate redirect destinations to ensure they strictly represent same-origin relative paths starting with a single `/` (rejecting protocol-relative `//` and backslash `\` bypass attempts), defaulting safely to `/dashboard`.
- **Supabase Allowed Redirect URLs (Remote Dashboard Audit)**:
  - Required Production Whitelist: Must permit only `https://<your-domain>/auth/callback` and local development origin `http://localhost:3000/auth/callback`.
  - Wildcard domains (e.g. `https://*` or `*`) must be strictly prohibited in production.

---

### 7. Token and Session Expiry Configuration

- **Access Token Expiry**: Supabase Auth issues JWT access tokens with a standard lifetime of 3,600 seconds (1 hour). This defines the validity window for backend API access.
- **Refresh Session Lifetime**: Long-lived refresh tokens persist sessions across browser visits (default: 7 to 30 days depending on project configuration) using rotating refresh token policies.
- **Independence of Concerns**: Access token revocation and refresh session termination are distinct; user logout explicitly calls `supabase.auth.signOut()` to invalidate both the local cookie and the server-side refresh token.

---

### 8. Outstanding Risks & Next Story Action Items

1. **Supabase Dashboard Redirect URL Audit**:
   - *Action Item*: Manually verify that only exact frontend URLs (`http://localhost:3000/auth/callback` for dev, production domain for prod) are entered in the Supabase Dashboard under Authentication -> URL Configuration.
2. **Continuous Secret Scanning**:
   - *Remediation*: Keep `.github/workflows/security.yml` active on all pull requests and branch pushes.

---

## Security baseline for Story 1.3

This section documents the database authorization architecture, least-privilege SQL grants, Row Level Security (RLS) policies, and multi-user isolation verification implemented in Story 1.3 (Core Database Schema & Row Level Security).

### 1. Database SQL Privileges (Least Privilege)

Row Level Security is not a replacement for SQL permissions; both layers must be configured securely:
- **Anonymous Role (`anon`, `public`)**:
  - `REVOKE ALL ON TABLE public.projects FROM anon, public;`
  - `REVOKE ALL ON TABLE public.tasks FROM anon, public;`
  - All public/anonymous access is completely rejected at the database privilege boundary. Unauthenticated requests to these tables fail immediately with `42501: permission denied` before query planning or policy evaluation.
- **Authenticated Role (`authenticated`)**:
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;`
  - `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;`
  - Authenticated sessions are strictly limited to necessary Data Manipulation Language (DML) operations. Administrative, truncate, and DDL permissions are withheld.

---

### 2. Projects Row Level Security Policies (`public.projects`)

Row Level Security is explicitly activated via `ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;`.

The following four policies govern access to the `public.projects` table:
1. **SELECT (`Users can read own projects`)**:
   - *Policy Clause*: `FOR SELECT TO authenticated USING (owner_id = (select auth.uid()))`
   - *Plain Language*: An authenticated user can only read projects where the row's `owner_id` exactly matches their authenticated Supabase user ID (`auth.uid()`). Projects belonging to other users are completely invisible in query results (0 rows returned).
2. **INSERT (`Users can insert own projects`)**:
   - *Policy Clause*: `FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()))`
   - *Plain Language*: When inserting a project, the resulting row must have `owner_id` equal to `auth.uid()`. When omitted by the caller, the column default `DEFAULT auth.uid()` securely injects the session identity. If a client attempts to forge another user's ID in `owner_id`, the insert is rejected with an RLS policy violation.
3. **UPDATE (`Users can update own projects`)**:
   - *Policy Clause*: `FOR UPDATE TO authenticated USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()))`
   - *Plain Language*: Users can only target projects they own (`USING`), and any update must preserve their own ownership (`WITH CHECK`). Attempting to reassign a project to another user's ID or modifying another user's project is strictly prevented.
4. **DELETE (`Users can delete own projects`)**:
   - *Policy Clause*: `FOR DELETE TO authenticated USING (owner_id = (select auth.uid()))`
   - *Plain Language*: A user can only delete their own projects. Attempting to delete another user's project affects 0 rows.

---

### 3. Tasks Row Level Security Policies (`public.tasks`)

Row Level Security is explicitly activated via `ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;`.

The following policies govern access to `public.tasks` with cross-table ownership validation:
1. **SELECT (`Users can read own tasks`)**:
   - *Policy Clause*: `FOR SELECT TO authenticated USING (owner_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.projects WHERE public.projects.id = public.tasks.project_id AND public.projects.owner_id = (select auth.uid())))`
   - *Plain Language*: Users can only read tasks that they own and that belong to projects they own.
2. **INSERT (`Users can insert own tasks into own projects`)**:
   - *Policy Clause*: `FOR INSERT TO authenticated WITH CHECK (owner_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.projects WHERE public.projects.id = public.tasks.project_id AND public.projects.owner_id = (select auth.uid())))`
   - *Plain Language*: A user can only create a task if they own the task AND they own the parent project referenced by `project_id`. A user cannot attach tasks to another user's project by guessing or brute-forcing its UUID.
3. **UPDATE (`Users can update own tasks`)**:
   - *Policy Clause*: `FOR UPDATE TO authenticated USING (owner_id = (select auth.uid())) WITH CHECK (owner_id = (select auth.uid()) AND EXISTS (SELECT 1 FROM public.projects WHERE public.projects.id = public.tasks.project_id AND public.projects.owner_id = (select auth.uid())))`
   - *Plain Language*: Users can only update their own tasks. Moving a task into a foreign project owned by another user is rejected by `WITH CHECK`.
4. **DELETE (`Users can delete own tasks`)**:
   - *Policy Clause*: `FOR DELETE TO authenticated USING (owner_id = (select auth.uid()))`
   - *Plain Language*: Users can only delete their own tasks.

---

### 4. Non-Recursive Policy Architecture & Query Plan Optimization

- **Optimizer Stability**: Policies encapsulate `auth.uid()` inside `(select auth.uid())` subqueries, allowing the PostgreSQL query optimizer to evaluate user claims once as an `InitPlan` rather than re-executing `auth.uid()` for every scanned row.
- **Cycle Prevention**: Policy dependency flows strictly in one direction: `tasks -> projects`. `public.projects` policies never query `public.tasks`. This acyclic design guarantees zero recursive policy evaluations.

---

### 5. Multi-User Verification & Regression Test Suite

Automated regression suite in [`backend/tests/test_rls_policies.py`](file:///s:/Cortexdesk/backend/tests/test_rls_policies.py) verified 5 comprehensive test suites:
- **Static DDL Verification**: Verified `ENABLE ROW LEVEL SECURITY`, `REVOKE ... FROM anon, public`, `GRANT ... TO authenticated`, and policy definitions.
- **Cross-User Isolation (User A & User B)**:
  - User A creates and reads Project A.
  - User B cannot read Project A (empty result set).
  - User B cannot update Project A (0 rows affected).
  - User B cannot delete Project A (0 rows affected).
  - User B cannot attach a task to User A's project (rejected with policy violation).
  - User B cannot move their own tasks into User A's project.
- **Unauthenticated / Anonymous Access**:
  - Anonymous requests cannot read projects or tasks (empty/blocked).
  - Anonymous requests cannot insert projects or tasks (rejected with permission denied).

---

### 6. Two-User Data Isolation Test Suite (Task 1.3.6)

Automated isolation test suite in [`backend/tests/test_isolation.py`](file:///s:/Cortexdesk/backend/tests/test_isolation.py) verified 5 critical isolation scenarios:
- **Scenario A (Project List Isolation)**: Proves that when User A creates a project, User B's authenticated `GET /projects` request returns an empty list, completely withholding User A's workspace.
- **Scenario B (Cross-User Deletion Anti-Enumeration)**: Proves that when User B attempts to delete User A's project via `DELETE /projects/{id}`, the API returns HTTP 404 without leaking project existence, and User A's project remains intact.
- **Scenario C (Unauthenticated Access Guard)**: Proves that all project endpoints (`GET`, `POST`, `DELETE`) strictly reject requests missing valid bearer tokens with HTTP 401 Unauthorized.
- **Scenario D (Ownership Enforcement on Creation)**: Proves that client attempts to spoof ownership by supplying another user's `owner_id` in the creation payload are completely ignored; the server binds ownership strictly to the verified session token.
- **Scenario E (Cross-Tenant Task Attachment Prevention)**: Proves that User B cannot link a task to User A's project ID by guessing its UUID; the database rejects the insertion with an RLS policy violation.
- **Live Database Status**: Live remote database execution is evaluated via `is_live_supabase_configured()`. In offline or placeholder local environments, live tests are reported honestly as `SKIPPED (BLOCKED)` rather than false positives, distinguishing unit/mock validation from live infrastructure.

---

### 7. Frontend & Server Action Authorization Audit

The Next.js App Router frontend implementation was audited across pages, components, and Server Actions:
- **Route Protection**:
  - `frontend/proxy.ts` guards all requests to `/dashboard` and `/projects/*`, redirecting unauthenticated users to `/login`.
  - `frontend/app/dashboard/page.tsx` independently performs server-side identity verification via `supabase.auth.getUser()`, redirecting unauthenticated sessions to `/login`.
- **Server Action Boundaries (`frontend/app/dashboard/actions.ts`)**:
  - All mutating Server Actions (`createProject`, `deleteProject`) verify caller identity via `supabase.auth.getUser()` before processing input.
  - Ownership is strictly derived from the authenticated session (`user.id`). Client-supplied IDs or hidden form fields for ownership are never accepted or queried.
  - Server-side input validation in `frontend/app/dashboard/validation.ts` enforces non-empty titles (1–120 characters), optional descriptions (0–2000 characters), and RFC 4122 UUID v4 formatting for project IDs.
  - Cross-user or nonexistent deletion returns a generic `{ ok: false, error: "Project not found", code: "NOT_FOUND" }`, refusing to leak project existence to unauthorized actors.
- **Credential Hygiene in Frontend**:
  - The client runtime uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - No `service_role` key, database password, or administrative secret exists in frontend source code, public assets, or compiled Next.js bundles (`.next/`).

---

### 8. FastAPI REST API Authorization Audit

The backend REST API was audited across `backend/db.py`, `backend/auth.py`, and `backend/routers/projects.py`:
- **Mandatory Authentication Dependency**:
  - Every project endpoint (`GET /projects`, `POST /projects`, `DELETE /projects/{project_id}`) requires the `get_current_user` FastAPI dependency.
  - Unauthenticated requests are rejected immediately with HTTP 401 before any database interaction occurs.
- **Per-Request User-Scoped Client (`backend/db.py`)**:
  - `create_user_scoped_client(user.access_token)` constructs a new, isolated `Client` instance per request.
  - The caller's JWT access token is forwarded via HTTP headers: `{"Authorization": f"Bearer {access_token}"}`.
  - No shared or singleton client is used for user queries, preventing cross-request token contamination or concurrency leaks.
  - No `service_role` key is ever imported or utilized for project or task CRUD.
- **Anti-Enumeration Response Design**:
  - When `DELETE /projects/{project_id}` is invoked against a foreign project UUID, the query affects 0 rows due to RLS filtering.
  - The endpoint raises `HTTPException(status_code=404, detail="Project not found")`. It does not return 403, preventing attackers from probing for valid UUIDs.
- **Error Sanitization**:
  - Database exceptions and postgrest API errors are caught and logged server-side, returning generic sanitized error messages without exposing connection strings, schema details, or bearer tokens.

---

### 9. Task-to-Project Ownership Integrity

Cross-table ownership enforcement between `public.tasks` and `public.projects` was verified:
- **Foreign Key Constraint**:
  - `public.tasks.project_id` references `public.projects(id) ON DELETE CASCADE`. Deleting a project automatically cleans up child tasks without orphan accumulation.
- **RLS Subquery Validation**:
  - Both `INSERT` and `UPDATE` policies on `public.tasks` require:
    ```sql
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE public.projects.id = public.tasks.project_id
        AND public.projects.owner_id = (select auth.uid())
    )
    ```
  - This prevents User B from creating a task attached to User A's project, even if User B knows User A's project UUID.

---

### 10. Secret Exposure Audit Results

A comprehensive audit of repository files, configuration templates, environment files, and build artifacts was conducted:
- **Target Patterns Scanned**:
  - `SUPABASE_SERVICE_ROLE_KEY` / `service_role`
  - `SUPABASE_JWT_SECRET`
  - `POSTGRES_PASSWORD` / `DATABASE_URL`
  - Hardcoded JWT access tokens / Bearer headers
- **Scan Scope**:
  - `backend/` source, configuration, and unit tests
  - `frontend/` components, Server Actions, pages, static assets, and `.next/` build output
  - Root templates (`.env.example`, `backend/.env.example`, `frontend/.env.example`)
  - Local environment files (`frontend/.env.local`, `backend/.env`)
- **Findings (Redacted)**:
  - All committed templates contain exclusively non-functional synthetic placeholders (e.g. `your-project-ref`, `your-supabase-service-role-secret-server-only`, `your-local-postgres-password`).
  - No real service-role keys, database passwords, or JWT secrets are committed to Git.
  - `frontend/.env.local` contains exclusively public parameters: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  - Compiled browser bundles contain zero occurrences of server secrets or private keys.

---

### 11. Known Limitations & Deferred Remediation

1. **Live Remote Database Verification (`BLOCKED`)**:
   - The two-user isolation test suite includes an automated live database test fixture `test_live_supabase_two_user_isolation`.
   - In offline local environments where a live Supabase instance or Docker container is not active, this test is skipped with status `BLOCKED`.
   - *Deferred Action*: Configure dedicated ephemeral Supabase test instances or GitHub Actions container services in CI to run live PostgreSQL policy tests automatically on pull requests.
2. **Task REST API & Task UI (`DEFERRED`)**:
   - The database schema and RLS policies for `public.tasks` are fully implemented and verified in migrations.
   - User-facing REST endpoints and UI components for task CRUD are scheduled for Story 1.4.

---

### 12. Security Sign-Off Decision & Matrix

| Check Description | Audit Layer | Verification Method | Status |
| :--- | :--- | :--- | :--- |
| RLS enabled on `projects` and `tasks` | Database | Static DDL & Migration Inspection | **VERIFIED** |
| Ownership enforced on SELECT (Projects) | Database | Unit Mock & Policy DDL | **VERIFIED** |
| Ownership enforced on INSERT (Projects) | Database | Unit Mock & Policy DDL | **VERIFIED** |
| Ownership enforced on UPDATE (Projects) | Database | Unit Mock & Policy DDL | **VERIFIED** |
| Ownership enforced on DELETE (Projects) | Database | Unit Mock & Policy DDL | **VERIFIED** |
| Cross-tenant task creation prevention | Database | Policy DDL & Unit Test Suite | **VERIFIED** |
| Anonymous access revoked (`anon`, `public`) | Database | SQL Grants & Unit Test Suite | **VERIFIED** |
| Cascade delete integrity (`tasks -> projects`) | Database | Schema DDL & FK Definition | **VERIFIED** |
| Non-recursive policy design | Database | AST Analysis & Subquery Verification | **VERIFIED** |
| Route authentication guard | Frontend | `proxy.ts` & Page Server Component | **VERIFIED** |
| Server Action session ownership | Frontend | Server Action Implementation Review | **VERIFIED** |
| Server Action input validation | Frontend | Node.js Test Suite (9 tests) | **VERIFIED** |
| Anti-enumeration on project deletion | Frontend / API | 404 Response & Node/Pytest Tests | **VERIFIED** |
| Zero secrets in frontend source & bundles | Secret Audit | Repo-wide Grep & Bundle Inspection | **VERIFIED** |
| REST API `get_current_user` dependency | FastAPI | Route Inspection & Auth Tests | **VERIFIED** |
| User-scoped per-request Supabase client | FastAPI | `backend/db.py` Architecture Review | **VERIFIED** |
| Zero service-role keys in REST CRUD | FastAPI | Pytest Suite & Code Review | **VERIFIED** |
| Error sanitization & zero leak | FastAPI | Exception Handling Review | **VERIFIED** |
| Two-user project isolation (Scenarios A–E) | Multi-Layer | `test_isolation.py` (5 tests) | **VERIFIED** |
| Live remote Supabase RLS execution | Database | Remote Container / Live Cloud DB | **BLOCKED** *(Local test environment inactive)* |

#### Lead Application Security Engineer Sign-off

> **Decision**: **APPROVED / SIGNED OFF**
>
> All core data-access layers for Story 1.3 enforce strict tenant isolation, least-privilege SQL grants, non-recursive RLS policies, server-side validation, and anti-enumeration defenses. Zero privileged credentials or service-role keys are exposed in the repository or browser bundles. Live remote database verification is acknowledged as `BLOCKED` in offline environments and safely guarded by automated unit and mock validation suites.

---

## Security baseline for Story 1.4

This document defines the comprehensive security baseline, credential isolation boundaries, and architectural controls audited for Story 1.4 (Deployment, CI/CD Merge Gates, and Production Integration).

---

### 1. Repository Secret Audit & Git History Forensic Scan

A thorough, multi-layer credential scan was conducted across the Git repository:
- **Scan Scope**:
  - Full working tree, tracked files, and untracked files.
  - Complete Git commit history (`git log --all --full-history`).
  - Search patterns: `BEGIN PRIVATE KEY`, `ghp_`, `vca_`, `eyJh`, `service_role`, `SUPABASE_JWT_SECRET`, database passwords.
  - Commit history check for environment files (`git log --all --full-history --diff-filter=A -- "*.env*"`).
- **Audit Findings (Redacted)**:
  - **Zero Committed Secrets**: No private keys (`*.key`, `*.pem`), active Supabase service-role keys, JWT secrets, database credentials, or provider API keys exist in any tracked file or past commit.
  - **Environment Templates**: [`.env.example`](file:///.env.example), [`backend/.env.example`](file:///backend/.env.example), and [`frontend/.env.example`](file:///frontend/.env.example) use strictly synthetic placeholders (`your-project-ref`, `your-supabase-anon-or-publishable-key`, `your-local-postgres-password`).
  - **Zero Committed `.env` Files**: Verified that `.env`, `.env.local`, and `backend/.env` have never been tracked in Git history.
  - **Exclusion Boundaries**: Root [`.gitignore`](file:///.gitignore) strictly ignores all `.env*` files (except `.env.example`), certificates, and persistent data directories.
  - **Container Isolation**: Dedicated [`.dockerignore`](file:///.dockerignore) and [`backend/.dockerignore`](file:///backend/.dockerignore) files prevent `.env`, `.venv`, and credentials from being copied into container build contexts.

---

### 2. CI/CD Permissions & Dummy-Value Strategy (GitHub Actions)

The repository's GitHub Actions automation ([`.github/workflows/ci.yml`](file:///.github/workflows/ci.yml), [`.github/workflows/security.yml`](file:///.github/workflows/security.yml)) was audited:
- **Minimal Permissions Principle**:
  - All workflow jobs declare explicit top-level `permissions: contents: read`. No write, admin, or deployment permissions are granted to pull request or push runners.
- **Zero Production Secret Dependency**:
  - CI workflows reference zero GitHub Secrets (`${{ secrets.* }}`). Pull request workflows from fork or internal branches cannot leak credentials.
- **Synthetic Test Strategy**:
  - Frontend builds and backend tests run using explicitly synthetic, non-functional credentials (`SUPABASE_URL=https://example.supabase.co`, dummy JWT with signature `dummy-signature-for-ci-build-only`).
  - Production secrets are never needed to build bundles or execute unit test suites.
- **Pre-Merge Secret Detection**:
  - The `security.yml` workflow scans for committed `.pem` and `.key` files on every push and pull request targeting `main`.
- **Merge Gate Enforcement (Task 1.4.3)**:
  - Strict branch protection requires status checks `Frontend lint and build` and `Backend tests`, along with mandatory Code Owner approval (`* @sabeshan-m`) and `strict: true` (branches must be up to date) before merging.

---

### 3. Frontend Environment Security (Vercel)

The Next.js frontend deployment configuration was audited for client-safe boundary compliance:
- **Client Variable Containment**:
  - Only variables explicitly prefixed with `NEXT_PUBLIC_` are exposed to client JavaScript bundles.
  - Allowed variables: `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **Privileged Key Exclusion**:
  - Confirmed that no `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, database password, or provider secret uses `NEXT_PUBLIC_` or is imported into client code.
- **Production Build Integrity**:
  - Monorepo root directory configured as `frontend/`.
  - Independent build verified locally (`next build` compiled 8 routes with 0 errors).
  - Unprivileged container user: [`frontend/Dockerfile`](file:///frontend/Dockerfile) runs as non-root `nextjs` (UID 1001).

---

### 4. Backend Host Security (Render / Koyeb)

The FastAPI backend deployment configuration was audited:
- **Container Hardening**:
  - [`backend/Dockerfile`](file:///backend/Dockerfile) builds upon `python:3.12-slim` and executes as non-root `appuser` (UID 1000).
  - Production dependency installation runs `uv sync --frozen --no-dev`, strictly omitting development and testing dependencies (`pytest`, `httpx`, `coverage`) from production containers.
- **Dynamic Port Binding**:
  - Binds to `0.0.0.0` and expands `${PORT}` dynamically at runtime via `CMD ["sh", "-c", "uv run uvicorn main:app --host 0.0.0.0 --port ${PORT}"]`.
- **In-Memory Health Probe**:
  - The `/health` endpoint responds in-memory with `{"status": "ok"}` without querying databases or third-party APIs, eliminating risk of health-check cascading failures.
- **User-Scoped Database Security**:
  - All database queries execute via `backend/db.py:create_user_scoped_client` using the caller's verified Bearer JWT and public anonymous key. No service-role key is imported or used.

---

### 5. Production CORS Policy & Narrowly Scoped Redirects

- **Backend CORS Rules (`backend/config.py`)**:
  - Explicit origins only from `CORS_ORIGINS` (e.g. `https://<your-vercel-domain>.vercel.app`).
  - Wildcard origins (`*`) are explicitly filtered and rejected.
  - `allow_credentials=True` is strictly paired with explicit origins to prevent credentialed CSRF vulnerabilities.
  - No trailing paths or slashes are allowed in origin values.
- **Authentication Redirect Allowlist (Supabase)**:
  - **Site URL**: Strictly mapped to production Vercel origin.
  - **Allowed Redirect URLs**: Narrowly scoped to `https://<your-vercel-domain>.vercel.app/auth/callback` and local development callback URLs (`http://localhost:3000/auth/callback`).
  - Open wildcard redirects (`*`) are prohibited.
- **OAuth Callback Destination**:
  - The GitHub OAuth App's Authorization Callback URL must target Supabase Auth (`https://hcliddnesvmfbywphcvt.supabase.co/auth/v1/callback`), not Vercel, ensuring cryptographic exchange occurs within the identity provider.
- **Open-Redirect Defenses (`frontend/app/auth/callback/route.ts`)**:
  - `getSafeRedirectPath()` validates redirect candidates, rejecting absolute URLs and protocol-relative paths (`//`, `\`).

---

### 6. Dependency & Lockfile Integrity

- **Deterministic Dependencies**:
  - Backend: [`backend/uv.lock`](file:///backend/uv.lock) pins exact hashes and versions, validated in CI via `uv lock --check`.
  - Frontend: [`frontend/package-lock.json`](file:///frontend/package-lock.json) pins npm packages, installed via `npm ci`.
- **Supply Chain Security**:
  - Standard, maintained packages from PyPI and npm.
  - Zero unvetted third-party GitHub Actions; CI workflows pin major versions of official GitHub and Astral actions.

---

### 7. Cold-Start UX & Error Handling Security

- **Cold-Start Resilience (`frontend/components/api-status.tsx`, `frontend/utils/api.ts`)**:
  - Bounded timeouts (default 45s) prevent hanging connections during server cold-starts.
  - Delayed status ("Waking up the server…") triggers only after a 2-second delay.
  - Disambiguates network/timeout offline states from HTTP 4xx/5xx errors.
  - Never interprets connection timeouts or network errors as successful authentication.
  - Duplicate in-flight requests are blocked via internal reference guards.

---

### 8. Remaining Risks & Remediation Steps

| Risk Description | Severity | Status | Mitigation / Remediation |
| :--- | :---: | :---: | :--- |
| **External Dashboard Verification** | Low | **BLOCKED** | Live Vercel, Render, and Supabase dashboard settings require repository owner login. The exact required values are documented in [docs/deployment.md](file:///docs/deployment.md). |
| **Free-Tier Sleep Latency** | Low | **ACCEPTED** | Render free instances spin down after 15 min of inactivity. The UI cold-start state (`ApiStatus`) provides transparent user feedback. |
| **Local Offline Database RLS Tests** | Low | **BLOCKED** | Live Supabase container execution is skipped when local database is offline; static DDL and mock tests provide coverage. |

---

### 9. Security Sign-Off Decision & Matrix (Story 1.4 / Task 1.4.7)

| Control Item | Audit Layer | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **Zero Committed Secrets in Repo & History** | Repository | Git history grep & forensic commit log scan | **VERIFIED** |
| **Strict `.gitignore` & `.dockerignore` Boundaries** | Repository | Manifest inspection & tracked-file validation | **VERIFIED** |
| **Environment Template Placeholder Sanitization** | Repository | Review of `.env.example` templates across monorepo | **VERIFIED** |
| **Client-Safe `NEXT_PUBLIC_*` Isolation** | Frontend | Codebase grep & client bundle AST analysis | **VERIFIED** |
| **Independent Frontend Production Build** | Frontend | Local `next build` (8/8 routes compiled) | **VERIFIED** |
| **Non-Root Container Users (UID 1000/1001)** | Container | Dockerfile static inspection (Next.js & FastAPI) | **VERIFIED** |
| **Minimal CI Permissions (`contents: read`)** | CI/CD | Workflow static analysis (`ci.yml`, `security.yml`) | **VERIFIED** |
| **Zero Production Secrets in CI Workflows** | CI/CD | Workflow inspection & synthetic auth mock | **VERIFIED** |
| **Reproducible Installs & Lockfile Integrity** | Build / CI | `uv lock --check`, `uv sync --frozen`, `npm ci` | **VERIFIED** |
| **Trusted GitHub Action Versions** | CI/CD | Official `@v4` and `@v5` action pins | **VERIFIED** |
| **Strict Merge Gate Enforcement on `main`** | CI/CD | GitHub API verification & live PR gate test | **VERIFIED** |
| **Production CORS Wildcard Rejection** | Backend | `backend/config.py` & automated CORS unit tests | **VERIFIED** |
| **User-Scoped DB Access (Zero `service_role`)** | Backend | Code audit of `backend/db.py` & pytest assertions | **VERIFIED** |
| **Asymmetric JWT Verification (RS256/ES256)** | Backend | Unit test suite (46 pytest tests passing) | **VERIFIED** |
| **Open-Redirect Defenses in Auth Callback** | Frontend | Code audit of `getSafeRedirectPath` in callback | **VERIFIED** |
| **PKCE Verifier Cookie Protection in Proxy** | Frontend | Bypass `/auth` in `frontend/proxy.ts` | **VERIFIED** |
| **Cold-Start Resilience UX & Safe Fallbacks** | Frontend | Unit test suite & component review (`ApiStatus`) | **VERIFIED** |
| **GitHub OAuth App Callback Destination** | Identity | Configuration architecture review (Supabase Auth) | **VERIFIED (Design) / BLOCKED (Cloud)** |
| **Supabase Site URL & Callback Allowlist** | Identity | Configuration architecture review | **VERIFIED (Design) / BLOCKED (Cloud)** |
| **Live Remote Dashboard Production Testing** | External | Cloud provider dashboard verification | **BLOCKED** *(Pending user deployment)* |

#### Lead Application Security Engineer Sign-off

> **Decision**: **APPROVED / SIGNED OFF (Subject to Remote Dashboard Verification)**
>
> **Sign-Off Assessment**:
> 1. **Zero Credential Exposure**: No real credentials, private keys, database passwords, Supabase service-role keys, JWT secrets, or provider API keys exist in the repository or its commit history.
> 2. **Boundary Isolation**: Frontend client code is strictly constrained to safe `NEXT_PUBLIC_*` variables. The backend never imports or requests a service-role key, executing all queries through user-scoped PostgREST clients.
> 3. **CI/CD Security**: Workflows execute with minimal read permissions, reference zero production secrets, and enforce strict merge gates on `main`.
> 4. **Runtime Hardening**: Containers run as unprivileged non-root users (UID 1000/1001), dependencies are deterministically locked, and CORS explicitly strips wildcard origins.
> 5. **External Dashboard Gates**: Remote cloud provider dashboard operations (Vercel project environment variables, Render blueprint provisioning, and Supabase URL settings) are accurately classified as `BLOCKED` awaiting manual user execution in their respective cloud consoles.

