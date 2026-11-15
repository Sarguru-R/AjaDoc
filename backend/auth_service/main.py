"""Auth service (port 8001): users, sign-up, login and the user directory.

Every route requires the internal key, so the service is only reachable through the gateway.
`/internal/*` routes are for other services and are never exposed by the gateway.
"""

import re
import sqlite3
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field, field_validator

from common import ApiError, CurrentUser, create_access_token, current_user, install_error_handlers, require_internal_key

from auth_service.passwords import verify_password
from auth_service.repository import (
    LoginThrottle,
    create_user,
    find_by_email,
    find_by_id,
    find_by_ids,
    init_db,
    list_users,
    public_user,
)

throttle = LoginThrottle()

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LENGTH = 8


class SignupRequest(BaseModel):
    name: str = Field(max_length=100)
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name is required.")
        return value

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        value = value.strip().lower()
        if not EMAIL_PATTERN.match(value):
            raise ValueError("Enter a valid email address.")
        return value

    @field_validator("password")
    @classmethod
    def _password(cls, value: str) -> str:
        if len(value) < MIN_PASSWORD_LENGTH:
            raise ValueError(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
        if value.isalpha() or value.isdigit():
            raise ValueError("Password must contain both letters and numbers or symbols.")
        return value


class LoginRequest(BaseModel):
    email: str = Field(min_length=1, max_length=254)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return value.strip().lower()


class LookupRequest(BaseModel):
    ids: list[str] = Field(max_length=500)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="AjaDoc - Auth service", lifespan=lifespan, dependencies=[Depends(require_internal_key)])
install_error_handlers(app)


def _signed_in(user: dict) -> dict:
    return {"user": user, "token": create_access_token(user["id"], user["email"], user["name"])}


@app.get("/health")
def health():
    return {"ok": True, "service": "auth"}


@app.post("/auth/signup", status_code=201)
def signup(body: SignupRequest):
    """Creates an account and signs the new user in."""
    if find_by_email(body.email) is not None:
        raise ApiError(409, "email_taken", "An account with this email already exists. Sign in instead.")
    try:
        user = create_user(body.email, body.name, body.password)
    except sqlite3.IntegrityError:  # two sign-ups for the same email at the same moment
        raise ApiError(409, "email_taken", "An account with this email already exists. Sign in instead.")
    return _signed_in(user)


@app.post("/auth/login")
def login(body: LoginRequest):
    if throttle.is_blocked(body.email):
        raise ApiError(429, "too_many_attempts", "Too many failed sign-in attempts. Try again in 15 minutes.")
    row = find_by_email(body.email)
    if row is None or not verify_password(body.password, row["password_hash"]):
        throttle.record_failure(body.email)
        raise ApiError(401, "invalid_credentials", "Incorrect email or password.")
    throttle.reset(body.email)
    return _signed_in(public_user(row))


@app.get("/auth/me")
def me(user: CurrentUser = Depends(current_user)):
    row = find_by_id(user.id)
    if row is None:  # token for a deleted user
        raise ApiError(401, "unauthenticated", "Please sign in to continue.")
    return {"user": public_user(row)}


@app.get("/users")
def directory(_user: CurrentUser = Depends(current_user)):
    """People you can share with (used for suggestions in the share dialog)."""
    return {"users": [public_user(row) for row in list_users()]}


# --- Internal API for other services ---------------------------------------------------------


@app.post("/internal/users/lookup")
def lookup_users(body: LookupRequest):
    return {"users": [public_user(row) for row in find_by_ids(list(set(body.ids)))]}


@app.get("/internal/users/by-email")
def user_by_email(email: str):
    row = find_by_email(email)
    if row is None:
        raise ApiError(404, "user_not_found", f"No user with the email {email.strip().lower()}.")
    return {"user": public_user(row)}
