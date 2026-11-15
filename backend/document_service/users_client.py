"""HTTP client for the auth service. The document service never reads the users table directly."""

import httpx

from common import ApiError, get_settings, internal_headers

def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=get_settings().auth_service_url, headers=internal_headers(), timeout=5.0)


async def _request(method: str, path: str, **kwargs) -> httpx.Response:
    try:
        async with _client() as client:
            return await client.request(method, path, **kwargs)
    except httpx.HTTPError:
        raise ApiError(503, "service_unavailable", "The user service is unavailable. Please try again shortly.")


async def lookup_users(user_ids: list[str]) -> dict[str, dict]:
    """Returns {user_id: {id, name, email}} for the given ids."""
    ids = sorted({uid for uid in user_ids if uid})
    if not ids:
        return {}
    response = await _request("POST", "/internal/users/lookup", json={"ids": ids})
    if response.status_code != 200:
        raise ApiError(503, "service_unavailable", "Could not load user details.")
    return {user["id"]: user for user in response.json()["users"]}


async def find_user_by_email(email: str) -> dict:
    response = await _request("GET", "/internal/users/by-email", params={"email": email})
    if response.status_code == 404:
        raise ApiError(404, "user_not_found", f"No user with the email {email}.")
    if response.status_code != 200:
        raise ApiError(503, "service_unavailable", "Could not look up that user.")
    return response.json()["user"]
