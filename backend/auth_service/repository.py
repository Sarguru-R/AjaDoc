"""Data access for users. The auth service is the only owner of user records."""

import sqlite3
import time
import uuid
from datetime import datetime, timezone

from common import DEMO_PASSWORD, DEMO_USERS, connect, demo_user_id, get_settings, init_database

from auth_service.passwords import hash_password

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    created_at     TEXT NOT NULL
);
"""


def _db() -> str:
    return get_settings().auth_db_path


def public_user(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "email": row["email"], "name": row["name"]}


def _drop_removed_tables() -> None:
    """Email verification codes were removed; drop their table from older databases."""
    with connect(_db()) as conn:
        conn.execute("DROP TABLE IF EXISTS email_otps")


def init_db() -> None:
    init_database(_db(), SCHEMA)
    _drop_removed_tables()
    if get_settings().seed_demo_data:
        seed_demo_users()


def create_user(email: str, name: str, password: str, user_id: str | None = None) -> dict:
    user = {"id": user_id or str(uuid.uuid4()), "email": email.strip().lower(), "name": name.strip()}
    with connect(_db()) as conn:
        conn.execute(
            "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
            (user["id"], user["email"], user["name"], hash_password(password), datetime.now(timezone.utc).isoformat()),
        )
    return user


def seed_demo_users() -> None:
    with connect(_db()) as conn:
        if conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] > 0:
            return
    for user in DEMO_USERS:
        create_user(user["email"], user["name"], DEMO_PASSWORD, user_id=demo_user_id(user["email"]))


def find_by_email(email: str) -> sqlite3.Row | None:
    with connect(_db()) as conn:
        return conn.execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()


def find_by_id(user_id: str) -> sqlite3.Row | None:
    with connect(_db()) as conn:
        return conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def find_by_ids(user_ids: list[str]) -> list[sqlite3.Row]:
    if not user_ids:
        return []
    placeholders = ",".join("?" for _ in user_ids)
    with connect(_db()) as conn:
        return conn.execute(f"SELECT * FROM users WHERE id IN ({placeholders})", user_ids).fetchall()


def list_users() -> list[sqlite3.Row]:
    with connect(_db()) as conn:
        return conn.execute("SELECT * FROM users ORDER BY name").fetchall()


class LoginThrottle:
    """Slows down password guessing: at most `limit` failed attempts per email per window."""

    def __init__(self, limit: int = 10, window_seconds: int = 15 * 60):
        self.limit = limit
        self.window = window_seconds
        self._failures: dict[str, list[float]] = {}

    def _recent(self, email: str) -> list[float]:
        cutoff = time.monotonic() - self.window
        recent = [t for t in self._failures.get(email, []) if t > cutoff]
        self._failures[email] = recent
        return recent

    def is_blocked(self, email: str) -> bool:
        return len(self._recent(email)) >= self.limit

    def record_failure(self, email: str) -> None:
        self._recent(email).append(time.monotonic())

    def reset(self, email: str) -> None:
        self._failures.pop(email, None)
