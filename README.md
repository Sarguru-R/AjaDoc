# AjaDoc

A lightweight collaborative document editor: create and format documents, import files, and share them with other users as editors or viewers.

**Live demo:** _<add your deployed frontend URL here>_

Built as microservices: a React frontend and three FastAPI services, each on its own port.

```
Browser ──▶ Frontend (React, :5173)
   │
   └── /api ──▶ API Gateway (:8000) ──X-Internal-Key──▶ Auth service (:8001)      ─ auth.db
                 verifies JWT,          + X-User-*   ──▶ Document service (:8002)  ─ documents.db
                 routes by prefix                              │
                                                               └─▶ Auth service (user lookups)
```

## Test accounts

These accounts are seeded on first start. Password for all: **`password123`**. You can also create your own account with **Create an account** on the sign-in page.

| User  | Email               | Starts with                                                |
|-------|---------------------|------------------------------------------------------------|
| Alice | `alice@example.com` | Owns "Welcome to AjaDoc", shared with Bob as editor   |
| Bob   | `bob@example.com`   | Sees the welcome doc under **Shared with me** (can edit)   |
| Carol | `carol@example.com` | Nothing — use her to test sharing and view-only access     |

**Suggested review path (≈3 min):**
1. Sign in as **Alice** → **+ New document** → type a title, format some text (headings, bold/italic/underline, lists). Watch "All changes saved".
2. Refresh the page — content and formatting are preserved.
3. **Share** → add `carol@example.com` as **Can view**.
4. Sign out → sign in as **Carol** → the doc is under **Shared with me** with a *View only* badge and opens read-only.
5. On the documents page, **Import file** → choose a `.txt`, `.md` or `.docx` file → it opens as a new editable document.

## Features

- **Documents**: create, rename (click the title), edit, delete (owner only), autosave with visible save state.
- **Templates**: a *Start a new document* gallery with Blank plus 12 templates (resume, cover letter, meeting notes, project proposal, PRD, technical design, status report, postmortem, project plan, business letter, lesson plan, research report), each with a live thumbnail. Your documents show as a grid of page thumbnails or as a list.
- **Editor**: app-style layout where the header and an icon toolbar stay pinned and only the page scrolls. A left **outline** shows every heading as a card (click to jump). A **+** under the last page opens a horizontal bar; whatever you pick (blank page, text, heading, lists, checklist, code, quote, divider) is added on a **new page**.
- **Print layout like Google Docs**: real A4 / Letter / Legal sheets with automatic pagination (a block that doesn't fit moves to the next page), page gaps and page numbers. A **ruler** with draggable left/right margin handles, and a **Page setup** dialog (status bar) for paper size, orientation, all four margins and presets (Normal, Narrow, Moderate, Wide). Page setup is saved per document and used when printing to PDF and in Word downloads. On screens narrower than the page, the editor switches to a continuous layout.
- **Lists and blocks**: clicking the bullet or number button asks which style to use: bullet styles (disc, circle, square, arrow, dash, tick), number styles (1., 01., a., A., i., I.), checklists, page breaks (shown as separate sheets, real page breaks when printed or exported), and **code cells** in an IDE style: language picker, syntax highlighting, line numbers, Tab indentation and copy. Code is stored as plain text, so indentation and syntax are never altered.
- **Formatting**: Normal text / Heading 1–3, bold, italic, underline, strikethrough, inline code, bulleted and numbered lists, quotes, dividers, clear formatting, undo/redo, Markdown-style shortcuts, a placeholder in empty documents, and a word/character count.
- **File import**: `.txt`, `.md` or `.docx` (max 2 MB) becomes a new editable document; headings, emphasis and lists are kept. Other types are rejected with a clear message.
- **Download**: from the editor's **Download** menu as Word (.docx), PDF (browser "Save as PDF" with a clean print layout), Markdown, HTML or plain text. Formatting, lists, quotes and links are kept; unsaved edits are saved first. Viewers can download too.
- **Sharing with roles**: the owner grants access by email as **Can edit**, **Can comment** or **Can view**, changes roles and removes access. The documents page has search plus **All / Owned by me / Shared with me** tabs.
- **Real-time collaboration indicators**: avatars show who else has the document open and whether they are viewing or editing. When someone else saves, your view updates automatically (if you have no unsaved edits) with a short notice.
- **Comments**: select text and add a comment; the panel shows the quoted text (click it to jump to that text), and comments can be resolved, reopened and deleted according to role.
- **Version history**: every save is recorded (rapid saves by the same person are grouped). Preview any version and restore it; a restore is itself a new version, so nothing is lost.
- **Persistence**: one SQLite database per service; content stored as sanitized HTML so formatting round-trips exactly.
- **Accounts**: sign up with name, email and password (validated on both sides) and you're signed straight in; sign in with email and password.
- **Security**: JWT sign-in verified at the gateway; services accept only requests carrying the internal key; server-side permission checks; HTML sanitization; input validation; login throttling; version-based conflict detection so two editors cannot silently overwrite each other.

## Run locally

Requires **Python 3.10+** and **Node.js 20+**.

**Quick start (one command):**

```bash
./runall.sh
```

This installs dependencies on first run, starts all three backend services and the frontend, and prints the URL and test accounts. Ctrl+C stops everything. The steps below do the same thing manually.

**1. Backend (three services):**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run_dev.py
```

This starts the gateway on **:8000**, the auth service on **:8001** and the document service on **:8002**. On first run it creates `backend/.env` with random `SECRET_KEY` and `INTERNAL_API_KEY` values shared by all three, and seeds the test accounts. Delete `backend/data/` to reset the data.

To run a service on its own: `uvicorn auth_service:app --port 8001` (same pattern for `document_service:app` on 8002 and `gateway:app` on 8000), with the same keys exported in each shell.

**2. Frontend (separate terminal):**

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173
```

The frontend calls the gateway at `VITE_API_URL` (default `http://localhost:8000`; see `frontend/.env.example`).

**Type check (frontend):** `cd frontend && npm run typecheck`
**Everything in Docker:**

```bash
export SECRET_KEY=$(openssl rand -hex 32) INTERNAL_API_KEY=$(openssl rand -hex 32)
docker compose up --build          # frontend :5173, gateway :8000
```

In Compose only the frontend and gateway are published; the auth and document services are reachable only on the internal network.

### Backend configuration

| Variable               | Default                   | Used by            | Purpose                                         |
|------------------------|---------------------------|--------------------|-------------------------------------------------|
| `SECRET_KEY`           | random per process        | auth, gateway      | Signs / verifies user JWTs                      |
| `INTERNAL_API_KEY`     | random per process        | all                | Required on every gateway → service request     |
| `AUTH_SERVICE_URL`     | `http://127.0.0.1:8001`   | gateway, documents | Where the auth service is                       |
| `DOCUMENT_SERVICE_URL` | `http://127.0.0.1:8002`   | gateway            | Where the document service is                   |
| `CORS_ORIGINS`         | `http://localhost:5173`   | gateway            | Frontend origins allowed to call the API        |
| `AUTH_DB_PATH` / `DOCUMENTS_DB_PATH` | `data/*.db` | auth / documents   | SQLite files                                    |
| `SEED_DEMO_DATA`       | `true`                    | auth, documents    | Seed test accounts and welcome document         |
| `APP_ENV`              | `development`             | all                | `production` refuses to start without both keys |

## Deployment (free): backend on Render, frontend on Vercel

The backend is three long-running services with SQLite and in-memory presence, so it runs on Render (normal servers). Serverless platforms like Vercel can't keep the SQLite files or the presence data between requests. The frontend is a static build, which Vercel hosts well.

**1. Backend on Render**
1. Render → **New → Blueprint** → pick this repo. `render.yaml` creates `ajadoc-auth`, `ajadoc-documents` and `ajadoc-gateway`, and generates the shared `SECRET_KEY` / `INTERNAL_API_KEY`.
2. After the first deploy, open each service's **Environment** tab and set these, using the `onrender.com` URLs Render assigned:
   - `ajadoc-documents`: `AUTH_SERVICE_URL` = auth service URL
   - `ajadoc-gateway`: `AUTH_SERVICE_URL`, `DOCUMENT_SERVICE_URL`, and `CORS_ORIGINS` = your Vercel URL (step 2)
3. Check `<gateway URL>/api/health`. It should show both services as `true`.

**2. Frontend on Vercel**
1. Vercel → **Add New → Project** → import this repo.
2. Set **Root Directory** to `frontend`. `frontend/vercel.json` sets up the Vite build and page routing.
3. Add the environment variable `VITE_API_URL` = your Render gateway URL (e.g. `https://ajadoc-gateway.onrender.com`), then deploy.
4. Put the Vercel URL into the gateway's `CORS_ORIGINS` on Render (step 1.2) and redeploy the gateway.

Notes: free Render services sleep when idle, so the first request after a pause can take up to a minute. Their disk isn't permanent, so data resets to the seeded demo accounts when a service restarts or redeploys.

## Project layout

```
backend/
  common/            shared package: config, internal-key + identity checks, JWT, errors, SQLite helper
  auth_service/      users, login, user directory, internal user lookups        (:8001)
  document_service/  documents, sharing, file import; calls auth for user info  (:8002)
  gateway/           public entry point: JWT check, routing, header injection   (:8000)
  run_dev.py         starts all three services for local development
frontend/
  src/pages/         LoginPage, DocumentList, EditorPage (TipTap + autosave)
  src/components/    ShareDialog
  src/api.ts         typed client for the gateway
```

Each backend package exposes its public functions in `__init__.py`, and all imports are absolute (`from common import ApiError`, `from document_service import app`). There are no relative `from .x` imports.

See [ARCHITECTURE.md](ARCHITECTURE.md) for design decisions and [AI_WORKFLOW.md](AI_WORKFLOW.md) for how AI tools were used.
