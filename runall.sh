#!/usr/bin/env bash
# Runs AjaDoc locally: the three backend services and the frontend dev server.
#
#   ./runall.sh
#
#   Frontend          http://localhost:5173
#   API gateway       http://localhost:8000
#   Auth service      http://127.0.0.1:8001
#   Document service  http://127.0.0.1:8002
#
# Installs Python and Node dependencies on first run. Press Ctrl+C to stop everything.

set -euo pipefail
set -m  # each background job gets its own process group, so it can be stopped as a whole

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PORTS=(8000 8001 8002 5173)

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# --- prerequisites ------------------------------------------------------------------------------
command -v python3 >/dev/null || fail "python3 is not installed (need Python 3.10+)."
command -v npm >/dev/null || fail "npm is not installed (need Node.js 20+)."

for port in "${PORTS[@]}"; do
  if (exec 3<>"/dev/tcp/127.0.0.1/$port") 2>/dev/null; then
    fail "port $port is already in use. Stop whatever is using it (another AjaDoc instance?) and try again."
  fi
done

if [[ ! -x "$BACKEND/.venv/bin/python" ]]; then
  info "Creating Python virtual environment"
  python3 -m venv "$BACKEND/.venv"
  "$BACKEND/.venv/bin/pip" install --upgrade pip >/dev/null
  info "Installing backend dependencies"
  "$BACKEND/.venv/bin/pip" install -r "$BACKEND/requirements.txt"
fi

if [[ ! -d "$FRONTEND/node_modules" ]]; then
  info "Installing frontend dependencies"
  (cd "$FRONTEND" && npm install)
fi

# --- start --------------------------------------------------------------------------------------
pids=()

stop_all() {
  trap - INT TERM EXIT
  echo
  info "Stopping AjaDoc"
  for pid in "${pids[@]}"; do
    kill -TERM -- "-$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap stop_all INT TERM EXIT

info "Starting backend services (gateway :8000, auth :8001, documents :8002)"
(cd "$BACKEND" && exec .venv/bin/python run_dev.py) &
pids+=($!)

info "Starting frontend (:5173)"
(cd "$FRONTEND" && exec node_modules/.bin/vite --port 5173 --strictPort) &
pids+=($!)

# Wait until the gateway answers, then print where to go.
for _ in $(seq 1 30); do
  if (exec 3<>/dev/tcp/127.0.0.1/8000) 2>/dev/null; then break; fi
  sleep 1
done

cat <<'EOF'

  AjaDoc is running
  -----------------
  Open:      http://localhost:5173
  Accounts:  alice@example.com / bob@example.com / carol@example.com
  Password:  password123

  Press Ctrl+C to stop.

EOF

# If either process exits (e.g. a crash), stop the other one too.
wait -n
