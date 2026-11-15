"""Tiny SQLite helper. Each service owns its own database file (database-per-service)."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path


def init_database(path: str, schema: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with connect(path) as conn:
        conn.executescript(schema)


@contextmanager
def connect(path: str) -> Iterator[sqlite3.Connection]:
    """A connection that commits on success, rolls back on error and always closes."""
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
