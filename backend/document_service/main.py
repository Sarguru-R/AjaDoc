"""Document service (port 8002): documents, import/export, sharing, version history, comments, presence.

The caller's identity arrives in X-User-* headers set by the gateway; the internal key proves the
request came through the gateway. Access is resolved per request:
  owner                       - documents.owner_id
  editor / commenter / viewer - document_shares.role

What each role can do:
  viewer     read, download, see comments, history and who is online
  commenter  + add comments, resolve/delete their own comments
  editor     + edit, restore versions, resolve any comment
  owner      + share, delete the document, delete any comment
Documents the caller cannot access are reported as 404 (not 403) so ids cannot be probed.
"""

from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, File, Response, UploadFile
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from common import ApiError, CurrentUser, current_user, install_error_handlers, require_internal_key

from document_service import presence
from document_service import repository as repo
from document_service.export import FORMATS, export_document
from document_service.content import MAX_CONTENT_CHARS, MAX_IMPORT_BYTES, MAX_TITLE_LENGTH, import_file, sanitize_content
from document_service.users_client import find_user_by_email, lookup_users

Role = Literal["owner", "editor", "commenter", "viewer"]
CAN_EDIT: tuple[Role, ...] = ("owner", "editor")
CAN_COMMENT: tuple[Role, ...] = ("owner", "editor", "commenter")


def _clean_title(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value:
        raise ValueError("Title cannot be empty.")
    if len(value) > MAX_TITLE_LENGTH:
        raise ValueError(f"Title must be at most {MAX_TITLE_LENGTH} characters.")
    return value


class CreateRequest(BaseModel):
    title: str | None = None
    # Optional starting content, e.g. from a template. Sanitized like every other write.
    content: str | None = Field(default=None, max_length=MAX_CONTENT_CHARS)
    template: str | None = Field(default=None, max_length=80)
    _title = field_validator("title")(_clean_title)


class Margins(BaseModel):
    """Page margins in millimetres."""

    top: float = Field(ge=0, le=100)
    right: float = Field(ge=0, le=100)
    bottom: float = Field(ge=0, le=100)
    left: float = Field(ge=0, le=100)


class PageSetup(BaseModel):
    size: Literal["A4", "Letter", "Legal"] = "A4"
    orientation: Literal["portrait", "landscape"] = "portrait"
    margins: Margins = Margins(top=25.4, right=25.4, bottom=25.4, left=25.4)

    @model_validator(mode="after")
    def _fits(self):
        width, height = PAGE_SIZES_MM[self.size]
        if self.orientation == "landscape":
            width, height = height, width
        m = self.margins
        if m.left + m.right > width - 40 or m.top + m.bottom > height - 40:
            raise ValueError("Margins are too large for this page size.")
        return self


PAGE_SIZES_MM = {"A4": (210.0, 297.0), "Letter": (215.9, 279.4), "Legal": (215.9, 355.6)}
DEFAULT_PAGE_SETUP = PageSetup()


def _page_setup(row) -> dict:
    raw = row["page_setup"]
    try:
        return PageSetup.model_validate_json(raw).model_dump() if raw else DEFAULT_PAGE_SETUP.model_dump()
    except ValueError:
        return DEFAULT_PAGE_SETUP.model_dump()


class UpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    title: str | None = None
    content: str | None = Field(default=None, max_length=MAX_CONTENT_CHARS)
    page_setup: PageSetup | None = Field(default=None, alias="pageSetup")
    # The version the client last loaded; used to detect concurrent edits.
    base_version: int = Field(alias="baseVersion")

    _title = field_validator("title")(_clean_title)

    @model_validator(mode="after")
    def _has_changes(self):
        if self.title is None and self.content is None and self.page_setup is None:
            raise ValueError("Nothing to update.")
        return self


class ShareRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    role: Literal["viewer", "commenter", "editor"]

    @field_validator("email")
    @classmethod
    def _email(cls, value: str) -> str:
        value = value.strip().lower()
        local, _, domain = value.partition("@")
        if not local or "." not in domain:
            raise ValueError("Enter a valid email address.")
        return value


class CommentRequest(BaseModel):
    body: str = Field(max_length=5000)
    quote: str | None = Field(default=None, max_length=1000)

    @field_validator("body")
    @classmethod
    def _body(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Comment cannot be empty.")
        return value

    @field_validator("quote")
    @classmethod
    def _quote(cls, value: str | None) -> str | None:
        value = " ".join((value or "").split())
        return value[:300] or None


class CommentUpdate(BaseModel):
    resolved: bool


class RestoreRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    base_version: int = Field(alias="baseVersion")


class PresenceRequest(BaseModel):
    editing: bool = False
    leaving: bool = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    repo.init_db()
    yield


app = FastAPI(title="AjaDoc - Document service", lifespan=lifespan, dependencies=[Depends(require_internal_key)])
install_error_handlers(app)


# --- helpers ---------------------------------------------------------------------------------


def _role_for(row, user_id: str) -> Role | None:
    if row is None:
        return None
    if row["owner_id"] == user_id:
        return "owner"
    return row["share_role"]


def _load(doc_id: str, user: CurrentUser):
    row = repo.get_document_for_user(doc_id, user.id)
    role = _role_for(row, user.id)
    if role is None:
        raise ApiError(404, "not_found", "Document not found.")
    return row, role


def _require(role: Role, allowed: tuple[Role, ...], action: str) -> None:
    if role not in allowed:
        raise ApiError(403, "forbidden", f"You do not have permission to {action}.")


def _unknown_user(user_id: str) -> dict:
    return {"id": user_id, "name": "Unknown user", "email": ""}


def _user(users: dict[str, dict], user_id: str | None) -> dict | None:
    return users.get(user_id, _unknown_user(user_id)) if user_id else None


def _summary(row, role: Role, users: dict[str, dict]) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "version": row["version"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "owner": _user(users, row["owner_id"]),
        "updatedBy": _user(users, row["updated_by"]),
        "role": role,
        "pageSetup": _page_setup(row),
    }


def _preview(row) -> str:
    """The start of the content, for thumbnail previews in the document grid. The content is already
    sanitized, and a cut-off prefix of safe HTML is still safe (the browser closes open tags)."""
    return row["content"][:2500]


async def _full(doc_id: str, user: CurrentUser) -> dict:
    row, role = _load(doc_id, user)
    users = await lookup_users([row["owner_id"], row["updated_by"]])
    return {**_summary(row, role, users), "content": row["content"]}


async def _sharing_info(row) -> dict:
    shares = repo.list_shares(row["id"])
    users = await lookup_users([row["owner_id"], *(s["user_id"] for s in shares)])
    return {
        "owner": users.get(row["owner_id"], _unknown_user(row["owner_id"])),
        "shares": [{"user": users.get(s["user_id"], _unknown_user(s["user_id"])), "role": s["role"]} for s in shares],
    }


# --- routes ----------------------------------------------------------------------------------


@app.get("/health")
def health():
    return {"ok": True, "service": "documents"}


@app.get("/documents")
async def list_documents(user: CurrentUser = Depends(current_user)):
    """Owned and shared documents are returned separately so the UI can distinguish them."""
    owned = repo.list_owned(user.id)
    shared = repo.list_shared_with(user.id)
    users = await lookup_users([uid for row in [*owned, *shared] for uid in (row["owner_id"], row["updated_by"]) if uid])
    return {
        "owned": [{**_summary(row, "owner", users), "shareCount": row["share_count"], "preview": _preview(row)} for row in owned],
        "shared": [{**_summary(row, row["share_role"], users), "preview": _preview(row)} for row in shared],
    }


@app.post("/documents", status_code=201)
async def create_document(body: CreateRequest | None = None, user: CurrentUser = Depends(current_user)):
    title = (body.title if body else None) or "Untitled document"
    content = sanitize_content(body.content) if body and body.content else ""
    label = f"Created from template: {body.template}" if body and body.template else "Created"
    doc_id = repo.create_document(user.id, title, content, label=label)
    return {"document": await _full(doc_id, user)}


@app.post("/documents/import", status_code=201)
async def import_document(file: UploadFile | None = File(default=None), user: CurrentUser = Depends(current_user)):
    """Upload a .txt / .md / .docx file and turn it into a new editable document."""
    if file is None or not file.filename:
        raise ApiError(400, "missing_file", "Choose a file to import.")
    data = await file.read(MAX_IMPORT_BYTES + 1)
    if len(data) > MAX_IMPORT_BYTES:
        raise ApiError(413, "file_too_large", "File is too large (max 2 MB).")
    title, content = import_file(file.filename, data)
    doc_id = repo.create_document(user.id, title, content, label=f"Imported from {file.filename}"[:120])
    return {"document": await _full(doc_id, user)}


@app.get("/documents/{doc_id}")
async def get_document(doc_id: str, user: CurrentUser = Depends(current_user)):
    return {"document": await _full(doc_id, user)}


@app.patch("/documents/{doc_id}")
async def update_document(doc_id: str, body: UpdateRequest, user: CurrentUser = Depends(current_user)):
    row, role = _load(doc_id, user)
    _require(role, CAN_EDIT, "edit this document")
    title = body.title if body.title is not None else row["title"]
    content = sanitize_content(body.content) if body.content is not None else row["content"]
    page_setup = body.page_setup.model_dump_json() if body.page_setup else None
    if repo.update_document(doc_id, title, content, body.base_version, user.id, page_setup=page_setup) is None:
        raise ApiError(409, "version_conflict", "This document was changed elsewhere. Reload to get the latest version.")
    document = await _full(doc_id, user)
    document.pop("content")
    return {"document": document}


@app.get("/documents/{doc_id}/export")
async def export(doc_id: str, format: str = "docx", user: CurrentUser = Depends(current_user)):
    """Download the document as Word, Markdown, HTML or plain text. Anyone with access can download."""
    row, _role = _load(doc_id, user)
    if format not in FORMATS:
        raise ApiError(400, "unsupported_format", f"Unsupported format. Choose one of: {', '.join(FORMATS)}.")
    owner = (await lookup_users([row["owner_id"]])).get(row["owner_id"], {})
    data, media_type, disposition = export_document(row["title"], row["content"], owner.get("name", ""), format, _page_setup(row))
    return Response(content=data, media_type=media_type, headers={"Content-Disposition": disposition, "Cache-Control": "no-store"})


@app.delete("/documents/{doc_id}", status_code=204)
def delete_document(doc_id: str, user: CurrentUser = Depends(current_user)):
    _row, role = _load(doc_id, user)
    _require(role, ("owner",), "delete this document")
    repo.delete_document(doc_id)
    return Response(status_code=204)


# Sharing: anyone with access can see who has access; only the owner can change it.


@app.get("/documents/{doc_id}/shares")
async def get_shares(doc_id: str, user: CurrentUser = Depends(current_user)):
    row, _role = _load(doc_id, user)
    return await _sharing_info(row)


@app.put("/documents/{doc_id}/shares")
async def share_document(doc_id: str, body: ShareRequest, user: CurrentUser = Depends(current_user)):
    """Grants access, or changes the role if the user already has access."""
    row, role = _load(doc_id, user)
    _require(role, ("owner",), "share this document")
    target = await find_user_by_email(body.email)
    if target["id"] == row["owner_id"]:
        raise ApiError(400, "already_owner", "You already own this document.")
    repo.upsert_share(doc_id, target["id"], body.role)
    return await _sharing_info(row)


@app.delete("/documents/{doc_id}/shares/{user_id}")
async def unshare_document(doc_id: str, user_id: str, user: CurrentUser = Depends(current_user)):
    row, role = _load(doc_id, user)
    _require(role, ("owner",), "change sharing for this document")
    repo.delete_share(doc_id, user_id)
    return await _sharing_info(row)


# --- Version history: everyone with access can browse; editors and owners can restore. ---------


def _version_entry(row, users: dict[str, dict]) -> dict:
    return {
        "id": row["id"],
        "version": row["version"],
        "title": row["title"],
        "label": row["label"],
        "author": _user(users, row["author_id"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


@app.get("/documents/{doc_id}/versions")
async def list_versions(doc_id: str, user: CurrentUser = Depends(current_user)):
    _load(doc_id, user)
    rows = repo.list_versions(doc_id)
    users = await lookup_users([r["author_id"] for r in rows])
    return {"versions": [_version_entry(r, users) for r in rows]}


@app.get("/documents/{doc_id}/versions/{version_id}")
async def get_version(doc_id: str, version_id: str, user: CurrentUser = Depends(current_user)):
    _load(doc_id, user)
    row = repo.get_version(doc_id, version_id)
    if row is None:
        raise ApiError(404, "not_found", "Version not found.")
    users = await lookup_users([row["author_id"]])
    return {"version": {**_version_entry(row, users), "content": row["content"]}}


@app.post("/documents/{doc_id}/versions/{version_id}/restore")
async def restore_version(doc_id: str, version_id: str, body: RestoreRequest, user: CurrentUser = Depends(current_user)):
    """Restoring adds a new version with the old content, so nothing in the history is lost."""
    _row, role = _load(doc_id, user)
    _require(role, CAN_EDIT, "restore versions of this document")
    snapshot = repo.get_version(doc_id, version_id)
    if snapshot is None:
        raise ApiError(404, "not_found", "Version not found.")
    when = snapshot["updated_at"][:16].replace("T", " ")
    if repo.update_document(doc_id, snapshot["title"], snapshot["content"], body.base_version, user.id, label=f"Restored version from {when} UTC") is None:
        raise ApiError(409, "version_conflict", "This document was changed elsewhere. Reload to get the latest version.")
    return {"document": await _full(doc_id, user)}


# --- Comments: everyone with access can read; commenters and up can write. ----------------------


def _comment_entry(row, users: dict[str, dict]) -> dict:
    return {
        "id": row["id"],
        "body": row["body"],
        "quote": row["quote"],
        "author": _user(users, row["author_id"]),
        "resolved": bool(row["resolved"]),
        "resolvedBy": _user(users, row["resolved_by"]),
        "createdAt": row["created_at"],
    }


async def _comments_payload(doc_id: str) -> dict:
    rows = repo.list_comments(doc_id)
    users = await lookup_users([uid for r in rows for uid in (r["author_id"], r["resolved_by"]) if uid])
    return {"comments": [_comment_entry(r, users) for r in rows]}


@app.get("/documents/{doc_id}/comments")
async def list_comments(doc_id: str, user: CurrentUser = Depends(current_user)):
    _load(doc_id, user)
    return await _comments_payload(doc_id)


@app.post("/documents/{doc_id}/comments", status_code=201)
async def add_comment(doc_id: str, body: CommentRequest, user: CurrentUser = Depends(current_user)):
    _row, role = _load(doc_id, user)
    _require(role, CAN_COMMENT, "comment on this document")
    repo.create_comment(doc_id, user.id, body.body, body.quote)
    return await _comments_payload(doc_id)


def _load_comment(doc_id: str, comment_id: str):
    comment = repo.get_comment(doc_id, comment_id)
    if comment is None:
        raise ApiError(404, "not_found", "Comment not found.")
    return comment


@app.patch("/documents/{doc_id}/comments/{comment_id}")
async def update_comment(doc_id: str, comment_id: str, body: CommentUpdate, user: CurrentUser = Depends(current_user)):
    """Resolve or reopen: editors and owners for any comment, commenters for their own."""
    _row, role = _load(doc_id, user)
    comment = _load_comment(doc_id, comment_id)
    if not (role in CAN_EDIT or (role == "commenter" and comment["author_id"] == user.id)):
        raise ApiError(403, "forbidden", "You do not have permission to resolve this comment.")
    repo.set_comment_resolved(comment_id, body.resolved, user.id)
    return await _comments_payload(doc_id)


@app.delete("/documents/{doc_id}/comments/{comment_id}")
async def delete_comment(doc_id: str, comment_id: str, user: CurrentUser = Depends(current_user)):
    """Authors can delete their own comments; owners can delete any."""
    _row, role = _load(doc_id, user)
    comment = _load_comment(doc_id, comment_id)
    if not (role == "owner" or (role in CAN_COMMENT and comment["author_id"] == user.id)):
        raise ApiError(403, "forbidden", "You do not have permission to delete this comment.")
    repo.delete_comment(comment_id)
    return await _comments_payload(doc_id)


# --- Presence: who else has the document open, and whether it changed under you. ----------------


@app.post("/documents/{doc_id}/presence")
async def update_presence(doc_id: str, body: PresenceRequest, user: CurrentUser = Depends(current_user)):
    """Heartbeat. Returns the other people here now and the document's current version, so clients can
    show collaboration indicators and pick up changes saved by others."""
    row, role = _load(doc_id, user)
    if body.leaving:
        presence.leave(doc_id, user.id)
        return {"active": [], "version": row["version"]}
    presence.heartbeat(doc_id, user.id, body.editing and role in CAN_EDIT)
    others = [entry for entry in presence.active(doc_id) if entry[0] != user.id]
    users = await lookup_users([uid for uid, _, _ in others] + ([row["updated_by"]] if row["updated_by"] else []))
    return {
        "active": [{"user": _user(users, uid), "editing": editing} for uid, editing, _ in others],
        "version": row["version"],
        "updatedAt": row["updated_at"],
        "updatedBy": _user(users, row["updated_by"]),
    }
