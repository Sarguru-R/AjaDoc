"""API gateway package. Run with: uvicorn gateway:app --port 8000"""

from gateway.routing import PUBLIC_ROUTES, ROUTES, resolve
from gateway.main import app

__all__ = ["PUBLIC_ROUTES", "ROUTES", "app", "resolve"]
