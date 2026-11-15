"""Settings shared by every service, read from environment variables."""

import os
import secrets
import sys
from dataclasses import dataclass, field


def _env_list(name: str, default: str) -> list[str]:
    return [item.strip().rstrip("/") for item in os.environ.get(name, default).split(",") if item.strip()]


def _secret(name: str) -> str:
    """Secrets must be set explicitly in production. In development a random value is used per process,
    which only works when all services share it, so `run_dev.py` generates one and passes it to every service."""
    value = os.environ.get(name)
    if value:
        return value
    if os.environ.get("APP_ENV") == "production":
        sys.exit(f"{name} must be set when APP_ENV=production")
    return secrets.token_hex(32)


@dataclass(frozen=True)
class Settings:
    # Signs user JWTs. Known only to the auth service (issues) and the gateway (verifies).
    secret_key: str = field(default_factory=lambda: _secret("SECRET_KEY"))
    # Shared by the gateway and the services; every service rejects requests without it.
    internal_api_key: str = field(default_factory=lambda: _secret("INTERNAL_API_KEY"))
    token_ttl_seconds: int = int(os.environ.get("TOKEN_TTL_SECONDS", str(12 * 60 * 60)))

    auth_service_url: str = os.environ.get("AUTH_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")
    document_service_url: str = os.environ.get("DOCUMENT_SERVICE_URL", "http://127.0.0.1:8002").rstrip("/")
    cors_origins: list[str] = field(default_factory=lambda: _env_list("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"))

    auth_db_path: str = os.environ.get("AUTH_DB_PATH", "data/auth.db")
    documents_db_path: str = os.environ.get("DOCUMENTS_DB_PATH", "data/documents.db")
    seed_demo_data: bool = os.environ.get("SEED_DEMO_DATA", "true").lower() == "true"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
