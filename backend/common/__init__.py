"""Shared building blocks for all services. Import from the package, e.g. `from common import ApiError`."""

from common.config import Settings, get_settings
from common.database import connect, init_database
from common.demo import DEMO_PASSWORD, DEMO_USERS, demo_user_id
from common.errors import ApiError, error_response, install_error_handlers
from common.tokens import create_access_token, decode_access_token
from common.security import (
    IDENTITY_HEADERS,
    INTERNAL_KEY_HEADER,
    USER_EMAIL_HEADER,
    USER_ID_HEADER,
    USER_NAME_HEADER,
    CurrentUser,
    current_user,
    internal_headers,
    require_internal_key,
)

__all__ = [
    "ApiError",
    "CurrentUser",
    "DEMO_PASSWORD",
    "DEMO_USERS",
    "connect",
    "create_access_token",
    "decode_access_token",
    "demo_user_id",
    "init_database",
    "IDENTITY_HEADERS",
    "INTERNAL_KEY_HEADER",
    "Settings",
    "USER_EMAIL_HEADER",
    "USER_ID_HEADER",
    "USER_NAME_HEADER",
    "current_user",
    "error_response",
    "get_settings",
    "install_error_handlers",
    "internal_headers",
    "require_internal_key",
]
