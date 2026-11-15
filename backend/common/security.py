"""Service-to-service trust.

The gateway is the only public entry point. It authenticates the user (JWT) and forwards the request
with two kinds of headers:
  * X-Internal-Key  - proves the request came from inside the system
  * X-User-*        - the authenticated user's identity
Services trust the X-User-* headers only because the internal key was valid.
"""

import hmac
from dataclasses import dataclass

from fastapi import Header, Request

from common.config import get_settings
from common.errors import ApiError

INTERNAL_KEY_HEADER = "X-Internal-Key"
USER_ID_HEADER = "X-User-Id"
USER_EMAIL_HEADER = "X-User-Email"
USER_NAME_HEADER = "X-User-Name"
IDENTITY_HEADERS = (USER_ID_HEADER, USER_EMAIL_HEADER, USER_NAME_HEADER)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str
    name: str


def internal_headers() -> dict[str, str]:
    return {INTERNAL_KEY_HEADER: get_settings().internal_api_key}


def require_internal_key(request: Request) -> None:
    """App-wide dependency for every internal service: reject calls that did not come through the gateway."""
    if request.url.path == "/health":
        return
    supplied = request.headers.get(INTERNAL_KEY_HEADER, "")
    if not hmac.compare_digest(supplied.encode(), get_settings().internal_api_key.encode()):
        raise ApiError(403, "forbidden", "Direct access to this service is not allowed.")


def current_user(
    x_user_id: str | None = Header(default=None),
    x_user_email: str | None = Header(default=None),
    x_user_name: str | None = Header(default=None),
) -> CurrentUser:
    """The authenticated user, as asserted by the gateway."""
    if not x_user_id or not x_user_email:
        raise ApiError(401, "unauthenticated", "Please sign in to continue.")
    return CurrentUser(id=x_user_id, email=x_user_email, name=x_user_name or x_user_email)
