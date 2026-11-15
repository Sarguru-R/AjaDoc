"""User access tokens (JWT, HS256). Issued by the auth service, verified by the gateway."""

import time

import jwt

from common.config import get_settings
from common.errors import ApiError

ALGORITHM = "HS256"
ISSUER = "ajadoc-auth"


def create_access_token(user_id: str, email: str, name: str) -> str:
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": user_id,
        "email": email,
        "name": name,
        "iss": ISSUER,
        "iat": now,
        "exp": now + settings.token_ttl_seconds,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            get_settings().secret_key,
            algorithms=[ALGORITHM],
            issuer=ISSUER,
            options={"require": ["sub", "email", "exp", "iss"]},
        )
    except jwt.ExpiredSignatureError:
        raise ApiError(401, "session_expired", "Your session has expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise ApiError(401, "unauthenticated", "Please sign in to continue.")
