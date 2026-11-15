"""Auth service package. Run with: uvicorn auth_service:app --port 8001"""

from auth_service.passwords import hash_password, verify_password
from auth_service.repository import create_user, find_by_email, find_by_id, init_db
from auth_service.main import app

__all__ = ["app", "create_user", "find_by_email", "find_by_id", "hash_password", "init_db", "verify_password"]
