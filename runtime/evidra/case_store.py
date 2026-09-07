import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4


class CaseStore:
    """Small local SQLite store for portable case and execution history."""

    def __init__(self, database: str | Path):
        self.database = str(database)
        self._initialize()

    @contextmanager
    def _connection(self):
        connection = sqlite3.connect(self.database)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS cases (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, name TEXT NOT NULL, source_path TEXT NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(case_id, fingerprint));
                CREATE TABLE IF NOT EXISTS case_workspaces (case_id TEXT PRIMARY KEY, root TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS evidence (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, name TEXT NOT NULL, root TEXT NOT NULL, file_count INTEGER NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS procedures (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, source TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, case_id TEXT NOT NULL, procedure_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, capability TEXT NOT NULL, status TEXT NOT NULL, message TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS results (id TEXT PRIMARY KEY, run_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);
                """
            )

    def register_case(self, case_id: str, name: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.execute("INSERT OR IGNORE INTO cases VALUES (?, ?, ?)", (case_id, name, now))

    def set_workspace(self, case_id: str, root: str) -> None:
        with self._connection() as connection:
            connection.execute("INSERT OR REPLACE INTO case_workspaces VALUES (?, ?)", (case_id, root))

    def get_workspace(self, case_id: str) -> str | None:
        with self._connection() as connection:
            row = connection.execute("SELECT root FROM case_workspaces WHERE case_id = ?", (case_id,)).fetchone()
        return str(row["root"]) if row else None

    def register_source(self, case_id: str, name: str, source_path: str, fingerprint: str) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            existing = connection.execute("SELECT id, case_id, name, source_path, fingerprint, status, created_at FROM sources WHERE case_id = ? AND fingerprint = ?", (case_id, fingerprint)).fetchone()
            if existing:
                return {**dict(existing), "existing": True}
            source_rows = connection.execute("SELECT id FROM sources").fetchall()
            next_number = max((int(value) for row in source_rows if (value := row["id"].removeprefix("SRC-")).isdigit()), default=0) + 1
            source_id = f"SRC-{next_number:03d}"
            connection.execute("INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?)", (source_id, case_id, name, source_path, fingerprint, "available", now))
            return {"id": source_id, "case_id": case_id, "name": name, "source_path": source_path, "fingerprint": fingerprint, "status": "available", "created_at": now, "existing": False}

    def list_sources(self, case_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute("SELECT id, case_id, name, source_path, fingerprint, status, created_at FROM sources WHERE case_id = ? ORDER BY created_at DESC", (case_id,)).fetchall()
        return [dict(row) for row in rows]

    def get_source(self, case_id: str, source_id: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute("SELECT id, case_id, name, source_path, fingerprint, status, created_at FROM sources WHERE case_id = ? AND id = ?", (case_id, source_id)).fetchone()
        return dict(row) if row else None

    def find_source_reference(self, case_id: str, reference: str) -> dict[str, Any] | None:
        normalized = reference.replace("\\", "/").removeprefix("Sources/").strip()
        with self._connection() as connection:
            row = connection.execute(
                "SELECT id, case_id, name, source_path, fingerprint, status, created_at FROM sources WHERE case_id = ? AND (id = ? OR lower(name) = lower(?) OR lower(source_path) = lower(?) OR source_path = ?) ORDER BY created_at LIMIT 1",
                (case_id, normalized, normalized, reference, reference),
            ).fetchone()
        return dict(row) if row else None

    def save_execution(self, case_id: str, procedure_source: str, execution: dict[str, Any]) -> str:
        now = datetime.now(timezone.utc).isoformat()
        procedure_id = f"PROC-{uuid4().hex[:10].upper()}"
        run_id = f"RUN-{uuid4().hex[:10].upper()}"
        with self._connection() as connection:
            connection.execute("INSERT OR IGNORE INTO cases VALUES (?, ?, ?)", (case_id, case_id, now))
            connection.execute("INSERT INTO procedures VALUES (?, ?, ?, ?)", (procedure_id, case_id, procedure_source, now))
            connection.execute("INSERT INTO runs VALUES (?, ?, ?, ?, ?)", (run_id, case_id, procedure_id, execution["status"], now))
            connection.executemany("INSERT INTO operations VALUES (?, ?, ?, ?, ?)", [(f"{run_id}:{step['operation_id']}", run_id, step["capability"], step["status"], step.get("message", "")) for step in execution["steps"]])
            connection.executemany("INSERT INTO results VALUES (?, ?, ?, ?, ?)", [(f"{run_id}:{result['id']}", run_id, result["type"], result["status"], json.dumps(result["value"])) for result in execution["results"]])
        return run_id

    def list_runs(self, case_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute("SELECT id, case_id, procedure_id, status, created_at FROM runs WHERE case_id = ? ORDER BY created_at DESC", (case_id,)).fetchall()
        return [dict(row) for row in rows]

    def get_case_snapshot(self, case_id: str) -> dict[str, Any]:
        with self._connection() as connection:
            case = connection.execute("SELECT id, name, created_at FROM cases WHERE id = ?", (case_id,)).fetchone()
            procedures = connection.execute("SELECT id, source, created_at FROM procedures WHERE case_id = ? ORDER BY created_at DESC", (case_id,)).fetchall()
        return {
            "case": dict(case) if case else None,
            "sources": self.list_sources(case_id),
            "evidence": self.list_evidence(case_id),
            "procedures": [dict(row) for row in procedures],
            "runs": self.list_runs(case_id),
        }

    def register_evidence(self, case_id: str, evidence_id: str, name: str, root: str, file_count: int) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as connection:
            connection.execute("INSERT OR IGNORE INTO cases VALUES (?, ?, ?)", (case_id, case_id, now))
            connection.execute("INSERT OR REPLACE INTO evidence VALUES (?, ?, ?, ?, ?, ?)", (evidence_id, case_id, name, root, file_count, now))

    def next_evidence_id(self) -> str:
        with self._connection() as connection:
            rows = connection.execute("SELECT id FROM evidence").fetchall()
        return f"EVID-{max((int(value) for row in rows if (value := row['id'].removeprefix('EVID-')).isdigit()), default=0) + 1:03d}"

    def list_evidence(self, case_id: str) -> list[dict[str, Any]]:
        with self._connection() as connection:
            rows = connection.execute("SELECT id, case_id, name, root, file_count, created_at FROM evidence WHERE case_id = ? ORDER BY created_at DESC", (case_id,)).fetchall()
        return [dict(row) for row in rows]

    def get_evidence_root(self, case_id: str, evidence_id: str) -> str | None:
        with self._connection() as connection:
            row = connection.execute("SELECT root FROM evidence WHERE case_id = ? AND id = ?", (case_id, evidence_id)).fetchone()
        return str(row["root"]) if row else None

    def find_evidence_reference(self, case_id: str, reference: str) -> dict[str, Any] | None:
        normalized = reference.replace("\\", "/").removeprefix("Evidence/").strip()
        with self._connection() as connection:
            row = connection.execute(
                "SELECT id, case_id, name, root, file_count, created_at FROM evidence WHERE case_id = ? AND (id = ? OR lower(name) = lower(?) OR lower(root) = lower(?) OR root = ?) ORDER BY created_at LIMIT 1",
                (case_id, normalized, normalized, reference, reference),
            ).fetchone()
        return dict(row) if row else None
