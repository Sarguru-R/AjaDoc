"""Who is looking at a document right now.

Clients send a heartbeat every few seconds while a document is open. Presence is short-lived by
nature, so it is kept in memory: an entry disappears when its heartbeat stops (tab closed, network
lost) or when the client says it is leaving. With several document-service instances this would
move to a shared store such as Redis.
"""

import threading
import time

ACTIVE_WINDOW_SECONDS = 25

_lock = threading.Lock()
# document_id -> user_id -> (editing, last_seen)
_presence: dict[str, dict[str, tuple[bool, float]]] = {}


def heartbeat(document_id: str, user_id: str, editing: bool) -> None:
    with _lock:
        _presence.setdefault(document_id, {})[user_id] = (editing, time.time())


def leave(document_id: str, user_id: str) -> None:
    with _lock:
        _presence.get(document_id, {}).pop(user_id, None)


def active(document_id: str) -> list[tuple[str, bool, float]]:
    """(user_id, editing, last_seen) for everyone seen recently; stale entries are dropped."""
    cutoff = time.time() - ACTIVE_WINDOW_SECONDS
    with _lock:
        entries = _presence.get(document_id, {})
        for user_id in [uid for uid, (_, seen) in entries.items() if seen < cutoff]:
            del entries[user_id]
        if not entries:
            _presence.pop(document_id, None)
            return []
        return [(uid, editing, seen) for uid, (editing, seen) in entries.items()]
