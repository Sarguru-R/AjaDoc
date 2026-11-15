"""Seeded reviewer accounts. User ids are derived from the email so that the auth service and the
document service (which have separate databases) agree on them without talking to each other."""

import uuid

DEMO_PASSWORD = "password123"
DEMO_USERS = [
    {"email": "alice@example.com", "name": "Alice Johnson"},
    {"email": "bob@example.com", "name": "Bob Smith"},
    {"email": "carol@example.com", "name": "Carol Lee"},
]

_NAMESPACE = uuid.UUID("5f0c6f0e-6a53-4f3e-9b8c-2f1d6f0a9c11")


def demo_user_id(email: str) -> str:
    return str(uuid.uuid5(_NAMESPACE, email.lower()))
