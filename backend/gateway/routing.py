"""Which public URL prefixes go to which service, and which routes need no sign-in."""

from common import get_settings

# First path segment after /api  ->  name of the service that owns it.
ROUTES = {
    "auth": "auth",
    "users": "auth",
    "documents": "documents",
}

# (method, path) pairs reachable without a token.
PUBLIC_ROUTES = {("POST", "auth/login"), ("POST", "auth/signup")}


def service_url(service: str) -> str:
    settings = get_settings()
    return {"auth": settings.auth_service_url, "documents": settings.document_service_url}[service]


def resolve(path: str) -> str | None:
    """Returns the target service for an /api/<path> request, or None if it is not publicly routable."""
    segments = [s for s in path.split("/") if s]
    if not segments or "internal" in segments or ".." in segments:
        return None
    return ROUTES.get(segments[0])
