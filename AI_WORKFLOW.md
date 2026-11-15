# AI workflow note

## Tools I used

I built this with Claude Code running in VS Code. It wrote most of the code, the Docker/Render setup and the first drafts of these notes. It also ran the builds and browser checks while we worked.

## How I worked with it

I treated it like a fast junior developer. I decided what to build and how it should look, it wrote the code, and I tested the result in the browser after every change and sent back what was wrong, usually with a screenshot.

The decisions I made along the way:

- The first version came out as a single Node/Express app. I didn't want a monolith, so I had it rebuilt as Python + FastAPI microservices: a gateway, an auth service and a document service, each on its own port, with the frontend separate. Services only accept requests that come through the gateway with a shared key. I also asked for package imports through `__init__.py` instead of relative imports.
- I named the product AjaDoc and asked for the Ajaia website's look. For the logo I wanted a document with a pencil, and the loading animation is the pencil writing.
- I took the demo-account buttons off the login page and added sign-up. I also tried email verification and sign-in with a one-time code, then removed it, because without a real email provider it only adds setup for reviewers.
- The first UI felt like a demo, not a product. I asked for:
  - a fixed header with only the content scrolling, and less empty space on wide screens
  - an icon toolbar and a placeholder in empty documents
  - bullet and number styles that you choose when you click the list button
  - heading cards on the left, and a "+" bar that adds each new block on a new page
  - code blocks that look like an IDE and never change indentation
  - a real A4 page view with a margin ruler and page setup, like Google Docs
  - templates and a thumbnail grid on the documents page
- I asked for all the optional stretch features: presence, comments, version history, export, and a "Can comment" role.
- I added `runall.sh` to start everything with one command. I also use PM2 locally, but kept that config out of git.
- A test suite was written and passed during development, but I chose not to include it in the submission.

## Where it saved me the most time

- Setting up the FastAPI services, models, Docker and Render files, all of which follow known patterns.
- Library details I would have spent a long time reading docs for: TipTap extensions (lists, checklists, code highlighting), the HTML sanitizer settings, Word import/export, and the page-break layout.
- Turning my screenshot feedback into a working change quickly, so I could do many rounds of review in one session.

## What I changed or threw out

- The first architecture (single Node app). Replaced with the microservices above.
- Email OTP. Built, tested, then removed.
- Login: the first version set the cookie's Secure flag based on `NODE_ENV`, which breaks login over plain HTTP. That was fixed, and later sessions moved to tokens because the frontend and API are on different ports.
- Bugs found while checking things, before they reached me: commenters could have edited documents, comment text wasn't picked up in read-only mode, renaming a document back to its old name didn't save, typing right after using the "+" menu got lost, and code lost its line breaks in exports.
- Real-time co-editing (two people typing in the same paragraph). I left it out. Presence, live refresh and conflict detection were enough for this scope.

## How I checked it

- I used the app myself after every change: signed up with my own account, created and edited documents, and tried each feature. Two bugs I found this way:
  - The documents page said "Cannot reach the server". The page had been opened from a different local address than the server allowed. Fixed, and errors now have a Retry button.
  - Scrolling down in a document pushed the whole app up and hid the header. Fixed so only the document area scrolls.
- I also pushed back on layout until it felt right: too much white space, the toolbar, the "+" menu layout, and the page view and margins.
- Scripted browser runs checked the main flows end to end: sign-in, editing and autosave, sharing with each role, two users seeing each other, comments, history restore, downloads, templates, page breaks and margins, and phone-width layouts.
- The Docker Compose setup was built and run to confirm the services work together and the internal services can't be reached directly.
