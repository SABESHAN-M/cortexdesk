"""
Regression tests for database migration 0001_core.sql (Task 1.3.1).

Validates:
1. SQL file presence, non-emptiness, and idempotency (IF NOT EXISTS).
2. Presence and configuration of public.projects table:
   - UUID PK with gen_random_uuid()
   - owner_id with default auth.uid() and FK to auth.users(id) ON DELETE CASCADE
   - title with VARCHAR(120), NOT NULL, and non-empty check
   - description with length constraint <= 2000
   - created_at with TIMESTAMPTZ default now()
3. Presence and configuration of public.tasks table:
   - UUID PK with gen_random_uuid()
   - project_id with FK to public.projects(id) ON DELETE CASCADE
   - owner_id with default auth.uid() and FK to auth.users(id) ON DELETE CASCADE
   - title with VARCHAR(200), NOT NULL, and non-empty check
   - priority restricted to ('low', 'medium', 'high')
   - status restricted to ('todo', 'in_progress', 'done')
   - created_at with TIMESTAMPTZ default now()
4. Proper index definitions for owner lookups and task-to-project lookups.
5. Task 1.3.1 boundary check: RLS statements are deferred to Task 1.3.2.
6. In-memory SQLite relational behavioral verification of cascade and constraints.
"""

from pathlib import Path
import re
import sqlite3
import pytest

MIGRATION_PATH = Path(__file__).resolve().parent.parent.parent / "database" / "migrations" / "0001_core.sql"


@pytest.fixture
def migration_sql() -> str:
    assert MIGRATION_PATH.exists(), f"Migration file not found at {MIGRATION_PATH}"
    content = MIGRATION_PATH.read_text(encoding="utf-8")
    assert len(content.strip()) > 0, "Migration file is empty"
    return content


def test_migration_file_exists_and_is_not_empty(migration_sql: str):
    """0001_core.sql must exist and contain valid DDL statements."""
    assert "CREATE TABLE IF NOT EXISTS public.projects" in migration_sql
    assert "CREATE TABLE IF NOT EXISTS public.tasks" in migration_sql


def test_projects_table_schema(migration_sql: str):
    """Verify projects table columns, types, defaults, and constraints."""
    projects_block = re.search(
        r"CREATE TABLE IF NOT EXISTS public\.projects\s*\((.*?)\);",
        migration_sql,
        re.DOTALL | re.IGNORECASE,
    )
    assert projects_block is not None, "public.projects CREATE TABLE statement not found"
    body = projects_block.group(1)

    # UUID primary key with default gen_random_uuid()
    assert re.search(r"id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)", body, re.IGNORECASE)

    # owner_id with default auth.uid() and foreign key to auth.users(id) with CASCADE
    assert re.search(
        r"owner_id\s+UUID\s+NOT\s+NULL\s+DEFAULT\s+auth\.uid\(\)\s+REFERENCES\s+auth\.users\s*\(id\)\s+ON\s+DELETE\s+CASCADE",
        body,
        re.IGNORECASE,
    )

    # title VARCHAR(120) NOT NULL
    assert re.search(r"title\s+VARCHAR\(120\)\s+NOT\s+NULL", body, re.IGNORECASE)

    # description TEXT
    assert re.search(r"description\s+TEXT", body, re.IGNORECASE)

    # created_at TIMESTAMPTZ
    assert re.search(r"created_at\s+TIMESTAMPTZ\s+NOT\s+NULL", body, re.IGNORECASE)

    # Constraints: title length (1-120), description length (<= 2000)
    assert "char_length(trim(title)) > 0" in body
    assert "char_length(title) <= 120" in body
    assert "char_length(description) <= 2000" in body


def test_tasks_table_schema(migration_sql: str):
    """Verify tasks table columns, types, defaults, and constraints."""
    tasks_block = re.search(
        r"CREATE TABLE IF NOT EXISTS public\.tasks\s*\((.*?)\);",
        migration_sql,
        re.DOTALL | re.IGNORECASE,
    )
    assert tasks_block is not None, "public.tasks CREATE TABLE statement not found"
    body = tasks_block.group(1)

    # UUID primary key with default gen_random_uuid()
    assert re.search(r"id\s+UUID\s+PRIMARY\s+KEY\s+DEFAULT\s+gen_random_uuid\(\)", body, re.IGNORECASE)

    # project_id FK with ON DELETE CASCADE
    assert re.search(
        r"project_id\s+UUID\s+NOT\s+NULL\s+REFERENCES\s+public\.projects\s*\(id\)\s+ON\s+DELETE\s+CASCADE",
        body,
        re.IGNORECASE,
    )

    # owner_id with default auth.uid() and FK to auth.users(id) with CASCADE
    assert re.search(
        r"owner_id\s+UUID\s+NOT\s+NULL\s+DEFAULT\s+auth\.uid\(\)\s+REFERENCES\s+auth\.users\s*\(id\)\s+ON\s+DELETE\s+CASCADE",
        body,
        re.IGNORECASE,
    )

    # title VARCHAR(200) NOT NULL
    assert re.search(r"title\s+VARCHAR\(200\)\s+NOT\s+NULL", body, re.IGNORECASE)

    # priority default 'medium' and check in ('low', 'medium', 'high')
    assert re.search(r"priority\s+VARCHAR\(20\)\s+NOT\s+NULL\s+DEFAULT\s+'medium'", body, re.IGNORECASE)
    assert "priority IN ('low', 'medium', 'high')" in body

    # status default 'todo' and check in ('todo', 'in_progress', 'done')
    assert re.search(r"status\s+VARCHAR\(20\)\s+NOT\s+NULL\s+DEFAULT\s+'todo'", body, re.IGNORECASE)
    assert "status IN ('todo', 'in_progress', 'done')" in body

    # created_at TIMESTAMPTZ
    assert re.search(r"created_at\s+TIMESTAMPTZ\s+NOT\s+NULL", body, re.IGNORECASE)

    # Constraints: title length (1-200), description length (<= 5000)
    assert "char_length(trim(title)) > 0" in body
    assert "char_length(title) <= 200" in body
    assert "char_length(description) <= 5000" in body


def test_index_definitions(migration_sql: str):
    """Verify performance indexes supporting owner lookups and task-to-project lookups."""
    # Projects indexes
    assert "CREATE INDEX IF NOT EXISTS idx_projects_owner_id" in migration_sql
    assert "ON public.projects(owner_id)" in migration_sql

    assert "CREATE INDEX IF NOT EXISTS idx_projects_owner_created_at" in migration_sql
    assert "ON public.projects(owner_id, created_at DESC)" in migration_sql

    # Tasks indexes
    assert "CREATE INDEX IF NOT EXISTS idx_tasks_project_id" in migration_sql
    assert "ON public.tasks(project_id)" in migration_sql

    assert "CREATE INDEX IF NOT EXISTS idx_tasks_owner_id" in migration_sql
    assert "ON public.tasks(owner_id)" in migration_sql

    assert "CREATE INDEX IF NOT EXISTS idx_tasks_project_status" in migration_sql
    assert "ON public.tasks(project_id, status)" in migration_sql


def test_rls_not_implemented_prematurely(migration_sql: str):
    """Task 1.3.1 must not implement RLS policies or ALTER TABLE ENABLE RLS (deferred to 1.3.2)."""
    assert "ENABLE ROW LEVEL SECURITY" not in migration_sql.upper()
    assert "CREATE POLICY" not in migration_sql.upper()


def test_logical_relational_integrity_simulation():
    """
    Simulate the table schema and constraints in SQLite to verify relational
    behavior: foreign-key cascade delete, priority/status constraints, title constraints.
    """
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys = ON;")
    cursor = conn.cursor()

    # Mock auth.users table
    cursor.execute("""
        CREATE TABLE auth_users (
            id TEXT PRIMARY KEY
        );
    """)

    # Mock projects table mirroring 0001_core.sql constraints
    cursor.execute("""
        CREATE TABLE projects (
            id TEXT PRIMARY KEY,
            owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
            title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 120),
            description TEXT CHECK (description IS NULL OR length(description) <= 2000),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)

    # Mock tasks table mirroring 0001_core.sql constraints
    cursor.execute("""
        CREATE TABLE tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
            title TEXT NOT NULL CHECK (length(trim(title)) > 0 AND length(title) <= 200),
            description TEXT CHECK (description IS NULL OR length(description) <= 5000),
            priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
            status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
    """)

    # Setup base data
    user_id = "user-uuid-1"
    cursor.execute("INSERT INTO auth_users (id) VALUES (?)", (user_id,))

    # Insert valid project
    proj_id = "proj-uuid-1"
    cursor.execute(
        "INSERT INTO projects (id, owner_id, title, description) VALUES (?, ?, ?, ?)",
        (proj_id, user_id, "CortexDesk MVP", "Core workspace"),
    )

    # Insert valid task
    task_id = "task-uuid-1"
    cursor.execute(
        "INSERT INTO tasks (id, project_id, owner_id, title, priority, status) VALUES (?, ?, ?, ?, ?, ?)",
        (task_id, proj_id, user_id, "Implement 0001_core.sql", "high", "in_progress"),
    )

    # Verify task exists
    cursor.execute("SELECT COUNT(*) FROM tasks WHERE project_id = ?", (proj_id,))
    assert cursor.fetchone()[0] == 1

    # Verify invalid priority rejected
    with pytest.raises(sqlite3.IntegrityError):
        cursor.execute(
            "INSERT INTO tasks (id, project_id, owner_id, title, priority, status) VALUES (?, ?, ?, ?, ?, ?)",
            ("task-2", proj_id, user_id, "Bad priority", "urgent", "todo"),
        )

    # Verify invalid status rejected
    with pytest.raises(sqlite3.IntegrityError):
        cursor.execute(
            "INSERT INTO tasks (id, project_id, owner_id, title, priority, status) VALUES (?, ?, ?, ?, ?, ?)",
            ("task-3", proj_id, user_id, "Bad status", "low", "archived"),
        )

    # Verify empty/whitespace title rejected
    with pytest.raises(sqlite3.IntegrityError):
        cursor.execute(
            "INSERT INTO tasks (id, project_id, owner_id, title) VALUES (?, ?, ?, ?)",
            ("task-4", proj_id, user_id, "   "),
        )

    # Test Project Cascade Delete: Deleting project deletes its tasks
    cursor.execute("DELETE FROM projects WHERE id = ?", (proj_id,))
    cursor.execute("SELECT COUNT(*) FROM tasks WHERE id = ?", (task_id,))
    assert cursor.fetchone()[0] == 0, "Tasks were not cascade-deleted when project was deleted"

    # Test User Cascade Delete: Deleting user cascades to projects
    proj_id_2 = "proj-uuid-2"
    cursor.execute(
        "INSERT INTO projects (id, owner_id, title) VALUES (?, ?, ?)",
        (proj_id_2, user_id, "Second Project"),
    )
    cursor.execute("DELETE FROM auth_users WHERE id = ?", (user_id,))
    cursor.execute("SELECT COUNT(*) FROM projects WHERE id = ?", (proj_id_2,))
    assert cursor.fetchone()[0] == 0, "Projects were not cascade-deleted when auth user was deleted"

    conn.close()
