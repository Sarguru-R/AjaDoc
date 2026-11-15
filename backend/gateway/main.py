"""API gateway (port 8000) - the only service the browser talks to.

For each /api/<prefix>/... request it:
  1. finds the owning service from the prefix (internal routes are never exposed),
  2. verifies the user's JWT (except public routes such as login),
  3. strips any identity/internal headers the client tried to send,
  4. forwards the request with X-Internal-Key and the verified X-User-* headers.
"""

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from common import (
    USER_EMAIL_HEADER,
    USER_ID_HEADER,
    USER_NAME_HEADER,
    ApiError,
    decode_access_token,
    get_settings,
    install_error_handlers,
    internal_headers,
)

from gateway.routing import PUBLIC_ROUTES, resolve, service_url

MAX_BODY_BYTES = 3 * 1024 * 1024  # import limit is 2 MB; leave room for multipart overhead
FORWARDED_REQUEST_HEADERS = {"content-type", "accept", "accept-language"}
FORWARDED_RESPONSE_HEADERS = {"content-type", "content-disposition", "cache-control"}

app = FastAPI(title="AjaDoc - API gateway")
install_error_handlers(app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],  # lets the browser read the download filename
    max_age=600,
)


def _identity_headers(request: Request) -> dict[str, str]:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise ApiError(401, "unauthenticated", "Please sign in to continue.")
    claims = decode_access_token(token)
    return {
        USER_ID_HEADER: claims["sub"],
        USER_EMAIL_HEADER: claims["email"],
        USER_NAME_HEADER: claims.get("name", ""),
    }


async def _forward(service: str, method: str, path: str, request: Request, headers: dict[str, str], body: bytes) -> httpx.Response:
    try:
        async with httpx.AsyncClient(base_url=service_url(service), timeout=15.0) as client:
            return await client.request(method, f"/{path}", params=request.query_params, headers=headers, content=body)
    except httpx.HTTPError:
        raise ApiError(503, "service_unavailable", "A backend service is unavailable. Please try again shortly.")


@app.get("/api/health")
async def health():
    """Gateway health plus a reachability check of each downstream service."""
    status = {}
    for service in ("auth", "documents"):
        try:
            async with httpx.AsyncClient(base_url=service_url(service), timeout=3.0) as client:
                status[service] = (await client.get("/health")).status_code == 200
        except httpx.HTTPError:
            status[service] = False
    return {"ok": all(status.values()), "services": status}


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def proxy(path: str, request: Request):
    service = resolve(path)
    if service is None:
        raise ApiError(404, "not_found", "Unknown API route.")

    body = await request.body()
    if len(body) > MAX_BODY_BYTES:
        raise ApiError(413, "payload_too_large", "Request is too large.")

    # Only an allow-list of client headers is forwarded, so clients can never set
    # X-Internal-Key or X-User-* themselves.
    headers = {k: v for k, v in request.headers.items() if k.lower() in FORWARDED_REQUEST_HEADERS}
    headers.update(internal_headers())
    if (request.method, path.strip("/")) not in PUBLIC_ROUTES:
        headers.update(_identity_headers(request))

    upstream = await _forward(service, request.method, path, request, headers, body)
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        headers={k: v for k, v in upstream.headers.items() if k.lower() in FORWARDED_RESPONSE_HEADERS},
    )
