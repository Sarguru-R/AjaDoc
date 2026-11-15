"""Document service package. Run with: uvicorn document_service:app --port 8002"""

from document_service.content import IMPORT_EXTENSIONS, MAX_IMPORT_BYTES, import_file, sanitize_content
from document_service.users_client import find_user_by_email, lookup_users
from document_service.main import app

__all__ = [
    "IMPORT_EXTENSIONS",
    "MAX_IMPORT_BYTES",
    "app",
    "find_user_by_email",
    "import_file",
    "lookup_users",
    "sanitize_content",
]
