-- ==============================================================================
-- Migration: 0001_core_rls.sql
-- Description: Enforce Supabase Row Level Security & Grants (Task 1.3.2)
-- Target: PostgreSQL 14+ / Supabase
--
-- Tables secured:
--   - public.projects
--   - public.tasks
--
-- Security Controls:
--   1. Enable Row Level Security (RLS) on public.projects and public.tasks.
--   2. Explicit least-privilege SQL grants:
--      - Revoke all privileges from anon and public roles.
--      - Grant SELECT, INSERT, UPDATE, DELETE to authenticated role only.
--   3. Row Level Security policies for public.projects:
--      - SELECT: Users can read only their own projects (owner_id = auth.uid()).
--      - INSERT: Users can insert only with their own owner_id (owner_id = auth.uid()).
--      - UPDATE: Users can update only their own projects; cannot reassign owner_id.
--      - DELETE: Users can delete only their own projects.
--   4. Row Level Security policies for public.tasks:
--      - SELECT: Users can read only tasks they own under projects they own.
--      - INSERT: Users can insert tasks only with their own owner_id AND into projects
--                they own (prevents attaching tasks to foreign projects).
--      - UPDATE: Users can update only their own tasks AND cannot reassign owner_id
--                nor move the task to a foreign project.
--      - DELETE: Users can delete only their own tasks.
--
-- Defense-in-Depth & Non-Recursion:
--   - Uses (select auth.uid()) for query optimizer plan stability.
--   - Policy evaluation flow is strictly tasks -> projects (no circular recursion).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Enable Row Level Security
-- ------------------------------------------------------------------------------
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. SQL Privileges (Least Privilege)
-- ------------------------------------------------------------------------------
-- Revoke all default public/anon access to ensure complete data isolation
REVOKE ALL ON TABLE public.projects FROM anon, public;
REVOKE ALL ON TABLE public.tasks FROM anon, public;

-- Grant required DML permissions to authenticated users only
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.projects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tasks TO authenticated;

-- ------------------------------------------------------------------------------
-- 3. Policies: public.projects
-- ------------------------------------------------------------------------------

-- Drop existing policies if re-running migration to ensure clean idempotent state
DROP POLICY IF EXISTS "Users can read own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete own projects" ON public.projects;

-- SELECT: authenticated users can only view projects they own
CREATE POLICY "Users can read own projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
    owner_id = (select auth.uid())
);

-- INSERT: authenticated users can only insert projects with their own owner_id
CREATE POLICY "Users can insert own projects"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
    owner_id = (select auth.uid())
);

-- UPDATE: authenticated users can only update their own projects and cannot reassign owner
CREATE POLICY "Users can update own projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (
    owner_id = (select auth.uid())
)
WITH CHECK (
    owner_id = (select auth.uid())
);

-- DELETE: authenticated users can only delete their own projects
CREATE POLICY "Users can delete own projects"
ON public.projects
FOR DELETE
TO authenticated
USING (
    owner_id = (select auth.uid())
);


-- ------------------------------------------------------------------------------
-- 4. Policies: public.tasks
-- ------------------------------------------------------------------------------

-- Drop existing policies if re-running migration
DROP POLICY IF EXISTS "Users can read own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can insert own tasks into own projects" ON public.tasks;
DROP POLICY IF EXISTS "Users can update own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can delete own tasks" ON public.tasks;

-- SELECT: authenticated users can only view tasks they own in their projects
CREATE POLICY "Users can read own tasks"
ON public.tasks
FOR SELECT
TO authenticated
USING (
    owner_id = (select auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE public.projects.id = public.tasks.project_id
          AND public.projects.owner_id = (select auth.uid())
    )
);

-- INSERT: authenticated users can only insert tasks they own into projects they own
CREATE POLICY "Users can insert own tasks into own projects"
ON public.tasks
FOR INSERT
TO authenticated
WITH CHECK (
    owner_id = (select auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE public.projects.id = public.tasks.project_id
          AND public.projects.owner_id = (select auth.uid())
    )
);

-- UPDATE: authenticated users can only update their own tasks and cannot move to a foreign project
CREATE POLICY "Users can update own tasks"
ON public.tasks
FOR UPDATE
TO authenticated
USING (
    owner_id = (select auth.uid())
)
WITH CHECK (
    owner_id = (select auth.uid())
    AND EXISTS (
        SELECT 1 FROM public.projects
        WHERE public.projects.id = public.tasks.project_id
          AND public.projects.owner_id = (select auth.uid())
    )
);

-- DELETE: authenticated users can only delete their own tasks
CREATE POLICY "Users can delete own tasks"
ON public.tasks
FOR DELETE
TO authenticated
USING (
    owner_id = (select auth.uid())
);
