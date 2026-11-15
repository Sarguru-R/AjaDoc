"""Data access for documents, shares, version history and comments.

User details live in the auth service; only user ids are stored here.
"""

import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from common import connect, demo_user_id, get_settings, init_database

SHARE_ROLES = ("viewer", "commenter", "editor")

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id         TEXT PRIMARY KEY,
    owner_id   TEXT NOT NULL,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    version    INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    page_setup TEXT
);
CREATE TABLE IF NOT EXISTS document_shares (
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor')),
    created_at  TEXT NOT NULL,
    PRIMARY KEY (document_id, user_id)
);
-- Snapshots for version history. Rapid saves by the same person are merged into one entry.
CREATE TABLE IF NOT EXISTS document_versions (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version     INTEGER NOT NULL,
    title       TEXT NOT NULL,
    content     TEXT NOT NULL,
    author_id   TEXT NOT NULL,
    label       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comments (
    id          TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    author_id   TEXT NOT NULL,
    body        TEXT NOT NULL,
    quote       TEXT,
    resolved    INTEGER NOT NULL DEFAULT 0,
    resolved_by TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_versions_document ON document_versions(document_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_comments_document ON comments(document_id, created_at);
"""

# Saves by the same author within this window update one history entry instead of creating many.
VERSION_MERGE_WINDOW = timedelta(minutes=10)
MAX_VERSIONS_LISTED = 100

WELCOME_CONTENT = (
    "<h1>Welcome to AjaDoc</h1>"
    "<p>This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> as an "
    "<em>editor</em>. Carol cannot see it.</p>"
    "<h2>Things to try</h2>"
    "<ul>"
    "<li><p>Format text with <strong>bold</strong>, <em>italic</em> and <u>underline</u></p></li>"
    "<li><p>Add headings, bulleted lists and numbered lists from the toolbar</p></li>"
    "<li><p>Select text and add a <strong>comment</strong>, or open <strong>History</strong> to restore an earlier version</p></li>"
    "<li><p>Import a <code>.txt</code>, <code>.md</code> or <code>.docx</code> file from the documents page</p></li>"
    "<li><p>Use <strong>Share</strong> to give another user view, comment or edit access</p></li>"
    "</ul>"
    "<p>Changes save automatically.</p>"
)


def _db() -> str:
    return get_settings().documents_db_path


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- setup and migrations ---------------------------------------------------------------------


def _migrate_before_schema(conn: sqlite3.Connection) -> None:
    """Older databases: the shares table only allowed viewer/editor (SQLite cannot alter a CHECK), and
    documents had no updated_by column."""
    shares_sql = conn.execute("SELECT sql FROM sqlite_master WHERE name = 'document_shares'").fetchone()
    if shares_sql and "commenter" not in shares_sql[0]:
        conn.executescript(
            """
            ALTER TABLE document_shares RENAME TO document_shares_old;
            CREATE TABLE document_shares (
                document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                user_id     TEXT NOT NULL,
                role        TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor')),
                created_at  TEXT NOT NULL,
                PRIMARY KEY (document_id, user_id)
            );
            INSERT INTO document_shares SELECT document_id, user_id, role, created_at FROM document_shares_old;
            DROP TABLE document_shares_old;
            """
        )
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(documents)")}
    if columns and "updated_by" not in columns:
        conn.execute("ALTER TABLE documents ADD COLUMN updated_by TEXT")
    if columns and "page_setup" not in columns:
        conn.execute("ALTER TABLE documents ADD COLUMN page_setup TEXT")


def init_db() -> None:
    init_database(_db(), "")
    with connect(_db()) as conn:
        _migrate_before_schema(conn)
    init_database(_db(), SCHEMA)
    with connect(_db()) as conn:
        # Documents created before version history existed get their current state as the first entry.
        conn.execute(
            "INSERT INTO document_versions (id, document_id, version, title, content, author_id, label, created_at, updated_at) "
            "SELECT lower(hex(randomblob(16))), d.id, d.version, d.title, d.content, COALESCE(d.updated_by, d.owner_id), "
            "NULL, d.updated_at, d.updated_at FROM documents d "
            "WHERE NOT EXISTS (SELECT 1 FROM document_versions v WHERE v.document_id = d.id)"
        )
    if get_settings().seed_demo_data:
        seed_welcome_document()


def seed_welcome_document() -> None:
    with connect(_db()) as conn:
        if conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0] > 0:
            return
    doc_id = create_document(demo_user_id("alice@example.com"), "Welcome to AjaDoc", WELCOME_CONTENT)
    upsert_share(doc_id, demo_user_id("bob@example.com"), "editor")


# --- documents --------------------------------------------------------------------------------


def create_document(owner_id: str, title: str, content: str, label: str | None = "Created") -> str:
    doc_id = str(uuid.uuid4())
    now = _now()
    with connect(_db()) as conn:
        conn.execute(
            "INSERT INTO documents (id, owner_id, title, content, version, created_at, updated_at, updated_by) "
            "VALUES (?, ?, ?, ?, 1, ?, ?, ?)",
            (doc_id, owner_id, title, content, now, now, owner_id),
        )
    record_version(doc_id, 1, title, content, owner_id, label)
    return doc_id


def get_document_for_user(doc_id: str, user_id: str) -> sqlite3.Row | None:
    """The document plus the caller's share role (NULL when they are the owner or have no access)."""
    with connect(_db()) as conn:
        return conn.execute(
            "SELECT d.*, s.role AS share_role FROM documents d "
            "LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = ? "
            "WHERE d.id = ?",
            (user_id, doc_id),
        ).fetchone()


def list_owned(user_id: str) -> list[sqlite3.Row]:
    with connect(_db()) as conn:
        return conn.execute(
            "SELECT d.*, (SELECT COUNT(*) FROM document_shares s WHERE s.document_id = d.id) AS share_count "
            "FROM documents d WHERE d.owner_id = ? ORDER BY d.updated_at DESC",
            (user_id,),
        ).fetchall()


def list_shared_with(user_id: str) -> list[sqlite3.Row]:
    with connect(_db()) as conn:
        return conn.execute(
            "SELECT d.*, s.role AS share_role FROM document_shares s "
            "JOIN documents d ON d.id = s.document_id WHERE s.user_id = ? ORDER BY d.updated_at DESC",
            (user_id,),
        ).fetchall()


def update_document(
    doc_id: str, title: str, content: str, base_version: int, editor_id: str, label: str | None = None, page_setup: str | None = None
) -> int | None:
    """Optimistic concurrency: only applies if nobody saved since `base_version` was loaded.
    Returns the new version, or None on conflict. `page_setup` (JSON) is left unchanged when None."""
    with connect(_db()) as conn:
        cursor = conn.execute(
            "UPDATE documents SET title = ?, content = ?, version = version + 1, updated_at = ?, updated_by = ?, "
            "page_setup = COALESCE(?, page_setup) WHERE id = ? AND version = ?",
            (title, content, _now(), editor_id, page_setup, doc_id, base_version),
        )
        if cursor.rowcount != 1:
            return None
    new_version = base_version + 1
    record_version(doc_id, new_version, title, content, editor_id, label)
    return new_version


def delete_document(doc_id: str) -> None:
    with connect(_db()) as conn:
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))


# --- version history --------------------------------------------------------------------------


def record_version(doc_id: str, version: int, title: str, content: str, author_id: str, label: str | None = None) -> None:
    """Adds a history entry, or folds the save into the author's latest entry if it is recent and unlabelled."""
    now = datetime.now(timezone.utc)
    with connect(_db()) as conn:
        latest = conn.execute(
            "SELECT id, author_id, label, created_at FROM document_versions WHERE document_id = ? "
            "ORDER BY updated_at DESC LIMIT 1",
            (doc_id,),
        ).fetchone()
        mergeable = (
            label is None
            and latest is not None
            and latest["author_id"] == author_id
            and latest["label"] is None
            and now - datetime.fromisoformat(latest["created_at"]) < VERSION_MERGE_WINDOW
        )
        if mergeable:
            conn.execute(
                "UPDATE document_versions SET version = ?, title = ?, content = ?, updated_at = ? WHERE id = ?",
                (version, title, content, now.isoformat(), latest["id"]),
            )
        else:
            conn.execute(
                "INSERT INTO document_versions (id, document_id, version, title, content, author_id, label, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), doc_id, version, title, content, author_id, label, now.isoformat(), now.isoformat()),
            )


def list_versions(doc_id: str) -> list[sqlite3.Row]:
    with connect(_db()) as conn:
        return conn.execute(
            "SELECT id, version, title, author_id, label, created_at, updated_at, length(content) AS size "
            "FROM document_versions WHERE document_id = ? ORDER BY updated_at DESC LIMIT ?",
            (doc_id, MAX_VERSIONS_LISTED),
        ).fetchall()


def get_version(doc_id: str, version_id: str) -> sqlite3.Row | None:
    with connect(_db()) as conn:
        return conn.execute(
            "SELECT * FROM document_versions WHERE document_id = ? AND id = ?", (doc_id, version_id)
        ).fetchone()


# --- sharing ----------------------------------------------------------------------------------


def list_shares(doc_id: str) -> list[sqlite3.Row]:
    with connect(_db()) as conn:
        return conn.execute(
            "SELECT user_id, role FROM document_shares WHERE document_id = ? ORDER BY created_at", (doc_id,)
        ).fetchall()


def upsert_share(doc_id: str, user_id: str, role: str) -> None:
    with connect(_db()) as conn:
        conn.execute(
            "INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?) "
            "ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role",
            (doc_id, user_id, role, _now()),
        )


def delete_share(doc_id: str, user_id: str) -> None:
    with connect(_db()) as conn:
        conn.execute("DELETE FROM document_shares WHERE document_id = ? AND user_id = ?", (doc_id, user_id))


# --- comments ---------------------------------------------------------------------------------


def list_comments(doc_id: str) -> list[sqlite3.Row]:
    with connect(_db()) as conn:
        return conn.execute("SELECT * FROM comments WHERE document_id = ? ORDER BY created_at", (doc_id,)).fetchall()


def get_comment(doc_id: str, comment_id: str) -> sqlite3.Row | None:
    with connect(_db()) as conn:
        return conn.execute("SELECT * FROM comments WHERE document_id = ? AND id = ?", (doc_id, comment_id)).fetchone()


def create_comment(doc_id: str, author_id: str, body: str, quote: str | None) -> str:
    comment_id = str(uuid.uuid4())
    with connect(_db()) as conn:
        conn.execute(
            "INSERT INTO comments (id, document_id, author_id, body, quote, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (comment_id, doc_id, author_id, body, quote, _now()),
        )
    return comment_id


def set_comment_resolved(comment_id: str, resolved: bool, user_id: str) -> None:
    with connect(_db()) as conn:
        conn.execute(
            "UPDATE comments SET resolved = ?, resolved_by = ? WHERE id = ?",
            (int(resolved), user_id if resolved else None, comment_id),
        )


def delete_comment(comment_id: str) -> None:
    with connect(_db()) as conn:
        conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
