-- ==============================================================================
-- Migration: 0001_core.sql
-- Description: CortexDesk Core Database Schema (Task 1.3.1)
-- Target: PostgreSQL 14+ / Supabase
--
-- Tables:
--   - public.projects: User-owned workspaces / project containers.
--   - public.tasks: Project-scoped task items with priority, status, and ownership.
--
-- Ownership Design:
--   - owner_id defaults to auth.uid() to automatically extract identity from
--     the authenticated Supabase JWT session, preventing client identity spoofing.
--   - Foreign keys reference auth.users(id) with ON DELETE CASCADE to ensure
--     clean data lifecycle cleanup when user accounts are deleted.
--   - tasks.project_id cascades on project deletion (ON DELETE CASCADE).
--
-- Safety & Idempotency:
--   - Uses CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS.
--   - Suitable for both fresh databases and idempotent replay.
--   - Non-destructive: Does not drop existing tables or delete existing data.
--
-- Note on Row Level Security (RLS):
--   - RLS activation and security policies are intentionally deferred to Task 1.3.2.
-- ==============================================================================

-- Ensure pgcrypto is available for gen_random_uuid() on older PostgreSQL versions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. Table: public.projects
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(120) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Integrity Constraints
    CONSTRAINT check_projects_title_length CHECK (
        char_length(trim(title)) > 0 AND char_length(title) <= 120
    ),
    CONSTRAINT check_projects_description_length CHECK (
        description IS NULL OR char_length(description) <= 2000
    )
);

-- Table & Column Documentation
COMMENT ON TABLE public.projects IS 'User-owned project workspaces in CortexDesk.';
COMMENT ON COLUMN public.projects.id IS 'Unique identifier for the project (UUIDv4).';
COMMENT ON COLUMN public.projects.owner_id IS 'Supabase authenticated user ID owning this project (defaults to auth.uid()).';
COMMENT ON COLUMN public.projects.title IS 'Display title of the project (1 to 120 characters).';
COMMENT ON COLUMN public.projects.description IS 'Optional description or context for the project (max 2000 characters).';
COMMENT ON COLUMN public.projects.created_at IS 'UTC timestamp when the project was created.';

-- Projects Indexes
-- Supports owner-based lookups and foreign-key cascade operations
CREATE INDEX IF NOT EXISTS idx_projects_owner_id 
    ON public.projects(owner_id);

-- Supports owner dashboard listings ordered by creation timestamp
CREATE INDEX IF NOT EXISTS idx_projects_owner_created_at 
    ON public.projects(owner_id, created_at DESC);


-- ------------------------------------------------------------------------------
-- 2. Table: public.tasks
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
    status VARCHAR(20) NOT NULL DEFAULT 'todo',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

    -- Integrity Constraints
    CONSTRAINT check_tasks_title_length CHECK (
        char_length(trim(title)) > 0 AND char_length(title) <= 200
    ),
    CONSTRAINT check_tasks_description_length CHECK (
        description IS NULL OR char_length(description) <= 5000
    ),
    CONSTRAINT check_tasks_priority CHECK (
        priority IN ('low', 'medium', 'high')
    ),
    CONSTRAINT check_tasks_status CHECK (
        status IN ('todo', 'in_progress', 'done')
    )
);

-- Table & Column Documentation
COMMENT ON TABLE public.tasks IS 'Individual tasks belonging to a project in CortexDesk.';
COMMENT ON COLUMN public.tasks.id IS 'Unique identifier for the task (UUIDv4).';
COMMENT ON COLUMN public.tasks.project_id IS 'Foreign key referencing the parent project (public.projects.id).';
COMMENT ON COLUMN public.tasks.owner_id IS 'Supabase authenticated user ID owning this task (defaults to auth.uid()).';
COMMENT ON COLUMN public.tasks.title IS 'Task summary or title (1 to 200 characters).';
COMMENT ON COLUMN public.tasks.description IS 'Optional task details or notes (max 5000 characters).';
COMMENT ON COLUMN public.tasks.priority IS 'Task priority level (low, medium, high). Default: medium.';
COMMENT ON COLUMN public.tasks.status IS 'Task workflow status (todo, in_progress, done). Default: todo.';
COMMENT ON COLUMN public.tasks.created_at IS 'UTC timestamp when the task was created.';

-- Tasks Indexes
-- Supports task-to-project lookups and foreign-key cascade operations
CREATE INDEX IF NOT EXISTS idx_tasks_project_id 
    ON public.tasks(project_id);

-- Supports owner-based lookups and user task aggregation
CREATE INDEX IF NOT EXISTS idx_tasks_owner_id 
    ON public.tasks(owner_id);

-- Supports project-filtered task board / list queries by status
CREATE INDEX IF NOT EXISTS idx_tasks_project_status 
    ON public.tasks(project_id, status);
