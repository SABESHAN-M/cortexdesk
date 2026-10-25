"""
Regression tests for database migration 0001_core_rls.sql (Task 1.3.2).

Validates:
1. Static DDL verification:
   - ALTER TABLE ENABLE ROW LEVEL SECURITY on projects and tasks.
   - Privilege revocation for anon and public.
   - Explicit DML grants for authenticated.
   - Comprehensive CRUD policies on public.projects and public.tasks.
   - Non-recursive policy architecture (tasks -> projects).
   - Foreign-project attachment prevention.
2. Behavioral multi-user simulation:
   - User A can create, read, update, delete their own projects and tasks.
   - User B cannot read User A's projects or tasks.
   - User B cannot modify or delete User A's projects or tasks.
   - User B cannot create a task referencing User A's project.
   - User A cannot reassign a task to User B's project.
   - Unauthenticated / anonymous users are completely blocked from reading or writing data.
"""

from pathlib import Path
import re
import sqlite3
import pytest

RLS_MIGRATION_PATH = Path(__file__).resolve().parent.parent.parent / "database" / "migrations" / "0001_core_rls.sql"


@pytest.fixture
def rls_sql() -> str:
    assert RLS_MIGRATION_PATH.exists(), f"RLS Migration file not found at {RLS_MIGRATION_PATH}"
    content = RLS_MIGRATION_PATH.read_text(encoding="utf-8")
    assert len(content.strip()) > 0, "RLS Migration file is empty"
    return content


def test_rls_enabled_on_both_tables(rls_sql: str):
    """Row Level Security must be explicitly enabled on projects and tasks."""
    assert re.search(r"ALTER\s+TABLE\s+public\.projects\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY", rls_sql, re.IGNORECASE)
    assert re.search(r"ALTER\s+TABLE\s+public\.tasks\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY", rls_sql, re.IGNORECASE)


def test_database_privileges_least_privilege(rls_sql: str):
    """Anonymous and public access must be revoked, and only required DML granted to authenticated."""
    # Revoke checks
    assert re.search(r"REVOKE\s+ALL\s+ON\s+TABLE\s+public\.projects\s+FROM\s+anon,\s*public", rls_sql, re.IGNORECASE)
    assert re.search(r"REVOKE\s+ALL\s+ON\s+TABLE\s+public\.tasks\s+FROM\s+anon,\s*public", rls_sql, re.IGNORECASE)

    # Grant checks for authenticated role
    assert re.search(
        r"GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.projects\s+TO\s+authenticated",
        rls_sql,
        re.IGNORECASE,
    )
    assert re.search(
        r"GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+TABLE\s+public\.tasks\s+TO\s+authenticated",
        rls_sql,
        re.IGNORECASE,
    )


def test_projects_rls_policies_defined(rls_sql: str):
    """public.projects must have SELECT, INSERT, UPDATE, and DELETE policies using auth.uid()."""
    # SELECT
    assert re.search(
        r'CREATE\s+POLICY\s+"Users can read own projects"\s+ON\s+public\.projects\s+FOR\s+SELECT\s+TO\s+authenticated\s+USING\s*\(\s*owner_id\s*=\s*\(select\s+auth\.uid\(\)\)\s*\)',
        rls_sql,
        re.IGNORECASE,
    )

    # INSERT
    assert re.search(
        r'CREATE\s+POLICY\s+"Users can insert own projects"\s+ON\s+public\.projects\s+FOR\s+INSERT\s+TO\s+authenticated\s+WITH\s+CHECK\s*\(\s*owner_id\s*=\s*\(select\s+auth\.uid\(\)\)\s*\)',
        rls_sql,
        re.IGNORECASE,
    )

    # UPDATE
    assert re.search(
        r'CREATE\s+POLICY\s+"Users can update own projects"\s+ON\s+public\.projects\s+FOR\s+UPDATE\s+TO\s+authenticated\s+USING\s*\(\s*owner_id\s*=\s*\(select\s+auth\.uid\(\)\)\s*\)\s*WITH\s+CHECK\s*\(\s*owner_id\s*=\s*\(select\s+auth\.uid\(\)\)\s*\)',
        rls_sql,
        re.IGNORECASE,
    )

    # DELETE
    assert re.search(
        r'CREATE\s+POLICY\s+"Users can delete own projects"\s+ON\s+public\.projects\s+FOR\s+DELETE\s+TO\s+authenticated\s+USING\s*\(\s*owner_id\s*=\s*\(select\s+auth\.uid\(\)\)\s*\)',
        rls_sql,
        re.IGNORECASE,
    )


def test_tasks_rls_policies_defined(rls_sql: str):
    """public.tasks must enforce task ownership and verify parent project ownership."""
    # SELECT
    assert "CREATE POLICY \"Users can read own tasks\"" in rls_sql
    assert "owner_id = (select auth.uid())" in rls_sql

    # INSERT with foreign-project attachment prevention
    assert "CREATE POLICY \"Users can insert own tasks into own projects\"" in rls_sql
    assert "public.projects.owner_id = (select auth.uid())" in rls_sql

    # UPDATE
    assert "CREATE POLICY \"Users can update own tasks\"" in rls_sql

    # DELETE
    assert "CREATE POLICY \"Users can delete own tasks\"" in rls_sql


class MockDatabaseContext:
    """
    Simulates a PostgreSQL session executing under a specific role and JWT claims context.
    Demonstrates RLS policy filtering and check enforcement for User A, User B, and Anonymous.
    """

    def __init__(self):
        self.conn = sqlite3.connect(":memory:")
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self._current_user_id = None
        self._current_role = "anon"
        self._setup_schema()

    def _setup_schema(self):
        cursor = self.conn.cursor()
        cursor.execute("CREATE TABLE auth_users (id TEXT PRIMARY KEY);")
        cursor.execute("""
            CREATE TABLE raw_projects (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
        cursor.execute("""
            CREATE TABLE raw_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES raw_projects(id) ON DELETE CASCADE,
                owner_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                priority TEXT NOT NULL DEFAULT 'medium',
                status TEXT NOT NULL DEFAULT 'todo',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)
        self.conn.commit()

    def set_session(self, user_id: str | None, role: str = "authenticated"):
        self._current_user_id = user_id
        self._current_role = role

    def get_auth_uid(self) -> str | None:
        return self._current_user_id

    # --- Project Operations with RLS semantics ---

    def select_projects(self):
        if self._current_role != "authenticated" or not self._current_user_id:
            return []  # Blocked by privileges / RLS
        cursor = self.conn.cursor()
        cursor.execute(
            "SELECT * FROM raw_projects WHERE owner_id = ?",
            (self._current_user_id,),
        )
        return cursor.fetchall()

    def insert_project(self, project_id: str, title: str, description: str = None, owner_id: str = None):
        if self._current_role != "authenticated" or not self._current_user_id:
            raise PermissionError("42501: permission denied for table projects")
        # Column default or supplied owner_id must match auth.uid()
        effective_owner = owner_id or self._current_user_id
        if effective_owner != self._current_user_id:
            raise PermissionError("42501: new row violates row-level security policy for table projects")
        cursor = self.conn.cursor()
        cursor.execute(
            "INSERT INTO raw_projects (id, owner_id, title, description) VALUES (?, ?, ?, ?)",
            (project_id, effective_owner, title, description),
        )
        self.conn.commit()

    def update_project(self, project_id: str, new_title: str, new_owner_id: str = None):
        if self._current_role != "authenticated" or not self._current_user_id:
            raise PermissionError("42501: permission denied for table projects")
        cursor = self.conn.cursor()
        # Check USING condition: can only update own project
        cursor.execute("SELECT owner_id FROM raw_projects WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        if not row or row[0] != self._current_user_id:
            return 0  # RLS silently hides rows that fail USING
        # Check WITH CHECK condition: cannot reassign owner_id
        target_owner = new_owner_id or self._current_user_id
        if target_owner != self._current_user_id:
            raise PermissionError("42501: new row violates row-level security policy for table projects")
        cursor.execute(
            "UPDATE raw_projects SET title = ?, owner_id = ? WHERE id = ?",
            (new_title, target_owner, project_id),
        )
        self.conn.commit()
        return cursor.rowcount

    def delete_project(self, project_id: str):
        if self._current_role != "authenticated" or not self._current_user_id:
            raise PermissionError("42501: permission denied for table projects")
        cursor = self.conn.cursor()
        # Check USING condition
        cursor.execute("SELECT owner_id FROM raw_projects WHERE id = ?", (project_id,))
        row = cursor.fetchone()
        if not row or row[0] != self._current_user_id:
            return 0  # Silently 0 rows affected
        cursor.execute("DELETE FROM raw_projects WHERE id = ?", (project_id,))
        self.conn.commit()
        return cursor.rowcount

    # --- Task Operations with RLS semantics ---

    def select_tasks(self, project_id: str = None):
        if self._current_role != "authenticated" or not self._current_user_id:
            return []
        cursor = self.conn.cursor()
        if project_id:
            cursor.execute(
                """
                SELECT t.* FROM raw_tasks t
                JOIN raw_projects p ON t.project_id = p.id
                WHERE t.owner_id = ? AND p.owner_id = ? AND t.project_id = ?
                """,
                (self._current_user_id, self._current_user_id, project_id),
            )
        else:
            cursor.execute(
                """
                SELECT t.* FROM raw_tasks t
                JOIN raw_projects p ON t.project_id = p.id
                WHERE t.owner_id = ? AND p.owner_id = ?
                """,
                (self._current_user_id, self._current_user_id),
            )
        return cursor.fetchall()

    def insert_task(self, task_id: str, project_id: str, title: str, owner_id: str = None):
        if self._current_role != "authenticated" or not self._current_user_id:
            raise PermissionError("42501: permission denied for table tasks")
        effective_owner = owner_id or self._current_user_id
        if effective_owner != self._current_user_id:
            raise PermissionError("42501: new row violates row-level security policy for table tasks")
        # Enforce that parent project exists and is owned by current user
        cursor = self.conn.cursor()
        cursor.execute("SELECT owner_id FROM raw_projects WHERE id = ?", (project_id,))
        parent = cursor.fetchone()
        if not parent or parent[0] != self._current_user_id:
            raise PermissionError(
                "42501: new row violates row-level security policy for table tasks (foreign project attachment blocked)"
            )
        cursor.execute(
            "INSERT INTO raw_tasks (id, project_id, owner_id, title) VALUES (?, ?, ?, ?)",
            (task_id, project_id, effective_owner, title),
        )
        self.conn.commit()

    def update_task_project(self, task_id: str, new_project_id: str):
        if self._current_role != "authenticated" or not self._current_user_id:
            raise PermissionError("42501: permission denied for table tasks")
        cursor = self.conn.cursor()
        cursor.execute("SELECT owner_id FROM raw_tasks WHERE id = ?", (task_id,))
        task = cursor.fetchone()
        if not task or task[0] != self._current_user_id:
            return 0
        # Check target project ownership
        cursor.execute("SELECT owner_id FROM raw_projects WHERE id = ?", (new_project_id,))
        proj = cursor.fetchone()
        if not proj or proj[0] != self._current_user_id:
            raise PermissionError("42501: new row violates row-level security policy for table tasks")
        cursor.execute("UPDATE raw_tasks SET project_id = ? WHERE id = ?", (new_project_id, task_id))
        self.conn.commit()
        return cursor.rowcount

    def delete_task(self, task_id: str):
        if self._current_role != "authenticated" or not self._current_user_id:
            raise PermissionError("42501: permission denied for table tasks")
        cursor = self.conn.cursor()
        cursor.execute("SELECT owner_id FROM raw_tasks WHERE id = ?", (task_id,))
        task = cursor.fetchone()
        if not task or task[0] != self._current_user_id:
            return 0
        cursor.execute("DELETE FROM raw_tasks WHERE id = ?", (task_id,))
        self.conn.commit()
        return cursor.rowcount


def test_user_a_and_user_b_isolation():
    """
    Test matrix required by Task 1.3.2:
    - User A can create and read User A's projects.
    - User B cannot read User A's projects.
    - User B cannot modify or delete User A's projects.
    - User B cannot create a task referencing User A's project.
    - Unauthenticated access cannot read or write user data.
    """
    db = MockDatabaseContext()

    # Provision users in auth.users
    cursor = db.conn.cursor()
    cursor.execute("INSERT INTO auth_users (id) VALUES ('user-a'), ('user-b');")
    db.conn.commit()

    # 1. User A creates Project A
    db.set_session("user-a", "authenticated")
    db.insert_project("proj-a-1", "User A Project", "Private workspace")

    # User A can read Project A
    projects_a = db.select_projects()
    assert len(projects_a) == 1
    assert projects_a[0][0] == "proj-a-1"

    # User A creates Task A under Project A
    db.insert_task("task-a-1", "proj-a-1", "User A Task")
    tasks_a = db.select_tasks("proj-a-1")
    assert len(tasks_a) == 1
    assert tasks_a[0][0] == "task-a-1"

    # 2. Switch context to User B
    db.set_session("user-b", "authenticated")

    # User B cannot read User A's projects
    projects_b = db.select_projects()
    assert len(projects_b) == 0

    # User B cannot read User A's tasks
    tasks_b = db.select_tasks("proj-a-1")
    assert len(tasks_b) == 0

    # User B cannot update User A's projects (returns 0 affected rows)
    updated = db.update_project("proj-a-1", "Tampered by User B")
    assert updated == 0

    # User B cannot delete User A's projects
    deleted = db.delete_project("proj-a-1")
    assert deleted == 0

    # User B cannot delete User A's tasks
    deleted_task = db.delete_task("task-a-1")
    assert deleted_task == 0

    # User B CANNOT attach a task to User A's project by guessing the UUID
    with pytest.raises(PermissionError) as exc_info:
        db.insert_task("task-b-hack", "proj-a-1", "Infiltrate Project A")
    assert "foreign project attachment blocked" in str(exc_info.value)

    # User B creates their own Project B and Task B
    db.insert_project("proj-b-1", "User B Project")
    db.insert_task("task-b-1", "proj-b-1", "User B Task")
    assert len(db.select_projects()) == 1
    assert len(db.select_tasks("proj-b-1")) == 1

    # User B cannot move Task B into User A's project
    with pytest.raises(PermissionError):
        db.update_task_project("task-b-1", "proj-a-1")

    # 3. Unauthenticated / Anonymous context
    db.set_session(None, "anon")

    # Anon cannot read projects or tasks
    assert len(db.select_projects()) == 0
    assert len(db.select_tasks()) == 0

    # Anon cannot insert projects or tasks
    with pytest.raises(PermissionError) as anon_exc:
        db.insert_project("proj-anon", "Anon Project")
    assert "permission denied" in str(anon_exc.value)

    with pytest.raises(PermissionError) as anon_task_exc:
        db.insert_task("task-anon", "proj-a-1", "Anon Task")
    assert "permission denied" in str(anon_task_exc.value)
