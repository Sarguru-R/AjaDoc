# Submission: AjaDoc

**Candidate:** Sarguru R
**Live URL:** _<add deployed frontend URL>_
**Walkthrough video:** see `VIDEO_URL.txt`

## Test accounts

Password for all: **`password123`**

- `alice@example.com`: owns a sample doc shared with Bob
- `bob@example.com`: has the sample doc under *Shared with me* (editor)
- `carol@example.com`: no documents; use to test sharing and view-only access

## What is included

| Path                      | Contents                                                        |
|---------------------------|-----------------------------------------------------------------|
| `README.md`               | Features, test accounts, local setup, Docker, deployment        |
| `ARCHITECTURE.md`         | Architecture note: services, security model, decisions, cuts, next steps |
| `AI_WORKFLOW.md`          | AI tools used, what was changed or rejected, verification       |
| `SUBMISSION.md`           | This file                                                       |
| `VIDEO_URL.txt`           | Walkthrough video link                                          |
| `docs/screenshots/`       | Screenshots of the main flows                                   |
| `backend/`                | FastAPI microservices: `gateway/`, `auth_service/`, `document_service/`, shared `common/`, `run_dev.py`, `Dockerfile`, requirements |
| `frontend/`               | React + TipTap app, `Dockerfile`, `nginx.conf`                  |
| `docker-compose.yml`      | Full stack in containers                                        |
| `render.yaml`             | Render Blueprint (3 web services + static site)                 |

## Status

**Working end to end**
- Create, rename, edit, autosave, reopen and delete documents
- Rich text: headings 1–3, bold, italic, underline, strikethrough, bulleted/numbered lists, quotes, undo/redo
- File import: `.txt`, `.md`, `.docx` → new editable document (max 2 MB; other types rejected with a message)
- Download a document as Word, PDF, Markdown, HTML or plain text (optional stretch: export)
- Sharing by email with **Can edit** / **Can comment** / **Can view** (role-based permissions); change role; remove access
- Documents page with search and All / Owned by me / Shared with me tabs; owner and access badges; read-only editor for viewers and commenters
- Real-time collaboration indicators: who is viewing or editing now, plus automatic refresh when someone else saves
- Comments on selected text: jump to quoted text, resolve/reopen, delete (by role)
- Version history: grouped snapshots, preview, restore (restores are new versions)
- Production layout: pinned header and icon toolbar, scrolling page, word count, empty-document placeholder, outline of heading cards, page width (standard / wide / full)
- Template gallery with 12 templates and live thumbnails; grid view of documents with page previews
- Bullet and numbering styles (the list button asks for the style), checklists, IDE-style code cells with syntax highlighting and preserved indentation
- Google Docs-style print layout: A4/Letter/Legal pages with automatic pagination, page numbers, margin ruler and Page setup (size, orientation, margins) saved per document and applied to PDF and Word output
- "+" bar (horizontal) adds each new block on a new page
- Sign-up (name, email, password with validation) and email + password sign-in
- Microservices on separate ports behind a gateway; JWT auth; internal-key protection between services
- Persistence in SQLite (one database per service); formatting preserved
- Conflict detection when two people save the same document

**Incomplete / intentionally out of scope**
- No automated test suite is included
- No simultaneous co-editing of the same text (CRDT); if two people edit at once, the second save gets a "Reload latest" prompt
- No suggestion mode; comments are linked to quoted text rather than highlighted inline
- No email verification, password reset or server-side token revocation (sign-out is client-side)
- Uploaded files are converted, not stored as attachments; `.docx` images are not imported
- On Render's free tier, data resets to the seeded state when an instance restarts, and sleeping services take time to wake

**Next 2–4 hours:** Postgres per service, refresh tokens with revocation, presence and live refresh (SSE), version history, Playwright in CI.
