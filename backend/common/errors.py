"""One error format for every service: {"error": {"code": ..., "message": ...}}."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app")


class ApiError(Exception):
    """An error whose message is safe to show to the user."""

    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _validation_message(exc: RequestValidationError) -> str:
    messages = []
    for err in exc.errors():
        msg = str(err.get("msg", "Invalid value."))
        # Pydantic prefixes custom ValueError messages with "Value error, ".
        messages.append(msg.removeprefix("Value error, "))
    return "; ".join(messages) or "Invalid request."


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError):
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError):
        return error_response(400, "validation_error", _validation_message(exc))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_request: Request, exc: StarletteHTTPException):
        code = "not_found" if exc.status_code == 404 else "http_error"
        return error_response(exc.status_code, code, str(exc.detail))

    @app.exception_handler(Exception)
    async def _unexpected(_request: Request, exc: Exception):
        log.exception("Unhandled error", exc_info=exc)
        return error_response(500, "internal_error", "Something went wrong. Please try again.")
