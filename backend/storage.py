from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

MIGRATION_1 = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email_normalized TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    city TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL CHECK(role IN ('user','reviewer')),
    status TEXT NOT NULL CHECK(status IN ('active','disabled')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    csrf_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS recovery_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT
);
CREATE INDEX IF NOT EXISTS recovery_user_idx ON recovery_tokens(user_id);
CREATE TABLE IF NOT EXISTS my_pm_states (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK(revision >= 1),
    state_json TEXT NOT NULL,
    state_sha256 TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


class Database:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=10000")
        return conn

    def migrate(self, now_iso: str) -> None:
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            try:
                conn.executescript(MIGRATION_1)
                exists = conn.execute("SELECT 1 FROM schema_migrations WHERE version=1").fetchone()
                if not exists:
                    conn.execute("INSERT INTO schema_migrations(version,applied_at) VALUES(1,?)", (now_iso,))
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    @contextmanager
    def transaction(self):
        conn = self.connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()
