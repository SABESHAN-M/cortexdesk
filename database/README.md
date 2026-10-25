# CortexDesk Database Migrations & Schema Reproducibility

This document guides developers and CI pipelines on recreating the CortexDesk PostgreSQL database schema, tables, constraints, indexes, SQL grants, and Row Level Security (RLS) policies from scratch.

---

## 📁 Migration Directory Structure

All version-controlled migrations are stored in [`database/migrations/`](./migrations/):

| Migration File | Description | Target Tables / Objects |
| :--- | :--- | :--- |
| [`0001_core.sql`](./migrations/0001_core.sql) | Core database schema definition | `public.projects`, `public.tasks`, foreign keys, check constraints, indexes, triggers |
| [`0001_core_rls.sql`](./migrations/0001_core_rls.sql) | Row Level Security & SQL grants | `ENABLE RLS`, `REVOKE ... FROM anon, public`, `GRANT ... TO authenticated`, 8 CRUD policies |

---

## 🚀 How to Apply Migrations

### Method 1: Using the Supabase CLI (Recommended for Development & Staging)

When developing with the Supabase local environment or linked to a remote Supabase project:

1. **Verify Supabase Status**:
   ```bash
   npx supabase status
   ```
2. **Apply All Pending Migrations**:
   ```bash
   npx supabase db push
   # Or for local dockerized Supabase:
   npx supabase migration up
   ```
3. **Reset Database to Fresh State (Local Only)**:
   ```bash
   npx supabase db reset
   ```

---

### Method 2: Using Standard PostgreSQL / Docker Compose

If using the local Docker Compose PostgreSQL container (`docker compose up -d`):

```bash
# Apply Core Schema
docker compose exec -T postgres psql -U postgres -d cortexdesk -f - < database/migrations/0001_core.sql

# Apply Row Level Security & Grants
docker compose exec -T postgres psql -U postgres -d cortexdesk -f - < database/migrations/0001_core_rls.sql
```

Or using native `psql` if connected to a remote or local PostgreSQL instance:

```bash
psql "$DATABASE_URL" -f database/migrations/0001_core.sql
psql "$DATABASE_URL" -f database/migrations/0001_core_rls.sql
```

---

### Method 3: Supabase Web Dashboard (SQL Editor)

1. Open your Supabase project in the browser: [https://supabase.com/dashboard](https://supabase.com/dashboard).
2. Navigate to **SQL Editor** in the left sidebar.
3. Open [`database/migrations/0001_core.sql`](./migrations/0001_core.sql), copy its contents, paste into the SQL Editor, and click **Run**.
4. Open [`database/migrations/0001_core_rls.sql`](./migrations/0001_core_rls.sql), copy its contents, paste into the SQL Editor, and click **Run**.
5. Navigate to **Table Editor** to confirm `projects` and `tasks` exist with RLS enabled.

---

## 🔒 Verification & Policy Audit

To verify that the migrations applied properly and RLS is active:

```sql
-- 1. Verify RLS is enabled on both tables
SELECT relname, relrowsecurity, relforcerowsecurity 
FROM pg_class 
WHERE relname IN ('projects', 'tasks');

-- 2. Inspect active policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
FROM pg_policies 
WHERE tablename IN ('projects', 'tasks');

-- 3. Verify SQL grants
SELECT grantee, table_name, privilege_type 
FROM information_schema.role_table_grants 
WHERE table_name IN ('projects', 'tasks');
```

Expected output:
- `relrowsecurity` is `true` for both tables.
- 4 policies exist on `projects` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
- 4 policies exist on `tasks` (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).
- `anon` and `public` roles have zero grants.
- `authenticated` role has `SELECT`, `INSERT`, `UPDATE`, `DELETE` grants.
