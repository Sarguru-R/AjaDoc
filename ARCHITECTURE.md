# Architecture note

## Services

| Service          | Port | Owns                          | Responsibilities                                              |
|------------------|------|-------------------------------|---------------------------------------------------------------|
| Frontend         | 5173 | —                             | React + TipTap editor; talks only to the gateway              |
| API gateway      | 8000 | —                             | Single public entry point: JWT check, routing, header injection |
| Auth service     | 8001 | `auth.db` (users)             | Login, token issuing, user directory, internal user lookups   |
| Document service | 8002 | `documents.db` (documents, shares) | Documents, file import, sharing and access checks       |

**Stack:** FastAPI + Uvicorn, Pydantic validation, SQLite (one file per service), httpx for service-to-service calls, PyJWT, nh3 (HTML sanitizer), Markdown and mammoth (file import), pytest. Frontend: React 19, Vite, TipTap 3.

## Request flow and the two keys

```
Browser ── Authorization: Bearer <JWT> ──▶ Gateway
   Gateway: 1. map /api/<prefix> to a service (auth, users → auth; documents → documents)
            2. refuse anything under /internal
            3. verify the JWT with SECRET_KEY (except POST /api/auth/login)
            4. forward an allow-list of client headers only, adding
               X-Internal-Key: INTERNAL_API_KEY  and  X-User-Id / X-User-Email / X-User-Name
Service:    rejects any request without the correct X-Internal-Key (403);
            trusts X-User-* only because the key proved the call came from the gateway
```

- **`SECRET_KEY`** signs user tokens. Only the auth service (which issues them) and the gateway (which verifies them) use it.
- **`INTERNAL_API_KEY`** protects service routing. Every service has it as an app-wide FastAPI dependency and compares it in constant time. Even if a service URL is public (as on Render's free tier), calling it directly gets a 403. Clients cannot inject identity headers because the gateway forwards only `Content-Type`, `Accept` and `Accept-Language` from the client.

The document service needs user names and email → id lookups for sharing. It gets them from the auth service's `/internal/users/*` endpoints, authenticated with the same internal key. Those endpoints are never routed by the gateway. The document service has no access to the users table.

## Data model

- **auth.db**: `users(id, email UNIQUE, name, password_hash scrypt, created_at)`
- **documents.db**: `documents(id, owner_id, title, content HTML, version, created_at, updated_at)` and `document_shares(document_id, user_id, role viewer|editor)`

User ids cross the service boundary as plain ids, with no cross-database foreign keys. Seeded user ids are derived from the email (UUIDv5) so both services can seed consistent demo data independently.

## Decisions and why

**Priority:** the core loop working end to end and being trustworthy. Write, format, close the tab, come back, share, and the other person sees exactly what you wrote with exactly the access you gave. Depth went into things that cause data loss or access bugs, not breadth features.

1. **Microservices with a gateway.** Auth and documents scale and deploy independently, and each owns its data. The gateway keeps one public surface, so authentication, CORS and routing rules live in one place instead of being repeated in every service. Cost: more moving parts, network hops for user lookups, and no cross-service transactions. Acceptable here because the only cross-service calls are read-only lookups.

2. **Stateless JWT sessions.** The gateway verifies tokens without calling the auth service on every request. Tradeoff: sign-out is client-side (token dropped) and tokens stay valid until expiry (12 h). A revocation list or short-lived tokens plus refresh would be next. Tokens are sent as `Authorization: Bearer` rather than cookies because the frontend and gateway are on different origins.

3. **TipTap (ProseMirror) for editing.** Rich-text editing is a solved, bug-prone problem; using a proven editor freed time for the product around it.

4. **HTML storage, sanitized server-side.** HTML is what the editor and both importers produce. Every write passes through an nh3 allow-list limited to the tags the editor can create, so stored content is safe even if a client is bypassed.

5. **Autosave with optimistic concurrency, not real-time co-editing.** Each document has a `version`; updates apply only `WHERE version = baseVersion`. A concurrent save gets `409`, and the UI stops autosaving and offers "Reload latest". This prevents silent overwrites at a fraction of the cost of CRDTs and WebSockets. The UI always shows save state and warns before closing with unsaved changes.

6. **Two roles enforced server-side.** Viewers read, editors edit, only owners share, change roles or delete. Inaccessible documents return **404, not 403**, so ids cannot be probed. The frontend mirrors this (read-only editor, no toolbar or Share button) but does not rely on it.

7. **Import creates a new document.** `.txt`/`.md`/`.docx` → editable document, processed in memory, 2 MB cap, type and integrity checks with specific errors. This is the most useful upload behaviour for a doc editor and needs no file storage.

8. **Package APIs via `__init__.py`, absolute imports only.** Each package (`common`, `auth_service`, `document_service`, `gateway`) re-exports its public functions from `__init__.py`; other code imports from the package (`from common import current_user`). No relative imports, so modules work the same under Uvicorn, pytest and Docker.

## Collaboration features

- **Roles.** `owner > editor > commenter > viewer`. Viewers read, download and see comments, history and presence; commenters can also comment and resolve or delete their own comments; editors can also edit, restore versions and resolve any comment; owners can also share, delete the document and delete any comment. All checks are in the document service.
- **Presence and live refresh.** While a document is open the client sends a heartbeat every 5 seconds (`POST /documents/{id}/presence`), marking itself as *editing* if the user typed in the last 20 seconds. The response lists the other people active in the last 25 seconds plus the document's current version. If that version is newer and the client has nothing unsaved, it fetches the document and swaps in the new content, keeping the cursor roughly in place. Presence lives in memory in the document service: it is short-lived by nature, and with several instances it would move to a shared store such as Redis. Polling was chosen over WebSockets so it works through the plain HTTP gateway and on free hosting.
- **Version history.** Each successful save writes a snapshot to `document_versions`. A save by the same author within 10 minutes of their last unlabelled snapshot updates that snapshot instead of adding one, so history stays readable. Creation, import and restore are labelled entries. Restoring uses the same optimistic-concurrency check as editing and creates a new version.
- **Comments.** Stored with the quoted text (whitespace-normalised, capped length) rather than a position anchor. Positions shift as the document changes, while a quote can be found again ("click to jump") or reported as no longer present. Anchored inline highlights would be the next step.

## Page layout

Pages are drawn, not split: the document stays one ProseMirror document, and a small plugin (`frontend/src/editor/pagination.ts`) measures the top-level blocks after each change. Where a block would cross the bottom margin, it inserts a non-editable "page gap" decoration as tall as the remaining space + bottom margin + the gap between sheets + the next top margin. Measurements subtract the gaps already inserted, so the layout settles in one pass, and spacing above headings uses padding rather than margins, so margin collapsing cannot skew the measurements. Manual page breaks are a `pageBreak` node. Blocks taller than a page are not split; they extend their sheet. Page size and margins are stored per document (`documents.page_setup`, validated so the text area keeps at least 4 cm) and feed the print `@page` rule and the Word section settings.

## Verification

The UI was checked end to end in headless Chrome against the real services on separate ports: create → format → reload → share → view as another user → import → phone width. Security behaviour was checked against the running services: direct calls without the internal key, spoofed identity headers, hidden `/internal` routes, and forged or expired tokens. The Docker Compose stack was built and smoke-tested. The submission does not include an automated test suite.

## Deliberately left out

| Cut                                     | Why                                                              |
|-----------------------------------------|------------------------------------------------------------------|
| Real-time co-editing (CRDT, live cursors) | Presence + live refresh + conflict detection cover the collaboration and data-loss risks at a fraction of the cost |
| Email verification, password reset, token revocation | Sign-up with validation covers onboarding for this scope |
| Message broker / async events between services | Only synchronous read lookups are needed today             |
| Images, tables, suggestion mode         | Breadth; would dilute polish on the core loop                    |
| Storing uploaded originals              | Import-to-document is the more useful behaviour                  |
| Managed database                        | SQLite per service keeps setup at zero; free hosting loses data on restart |

## Next 2–4 hours

1. Postgres per service (or a free hosted DB) so deployed data survives restarts.
2. Short-lived access tokens + refresh tokens with server-side revocation.
3. Presence and live refresh (SSE through the gateway) instead of reload-on-conflict.
4. Version history (the `version` column is already there) with restore; Markdown/PDF export.
5. An automated API and browser test suite in CI, and a gateway-level rate limit.
