"""Starts the gateway and both services locally, each on its own port.

    python run_dev.py

On first run a `.env` file with random SECRET_KEY and INTERNAL_API_KEY is created; every service
reads the same keys from it. Ctrl+C stops all services.
"""

import os
import secrets
import signal
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENV_FILE = ROOT / ".env"

SERVICES = [
    ("auth", "auth_service:app", 8001),
    ("documents", "document_service:app", 8002),
    ("gateway", "gateway:app", 8000),
]


def load_env() -> dict[str, str]:
    if not ENV_FILE.exists():
        ENV_FILE.write_text(
            f"SECRET_KEY={secrets.token_hex(32)}\n"
            f"INTERNAL_API_KEY={secrets.token_hex(32)}\n"
            "CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173\n"
        )
        print(f"Created {ENV_FILE.name} with new random keys")
    env = dict(os.environ)
    for line in ENV_FILE.read_text().splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            env.setdefault(key.strip(), value.strip())
    return env


def main() -> None:
    env = load_env()
    processes = []
    for name, target, port in SERVICES:
        cmd = [sys.executable, "-m", "uvicorn", target, "--host", "127.0.0.1", "--port", str(port), "--reload"]
        processes.append(subprocess.Popen(cmd, cwd=ROOT, env=env))
        print(f"  {name:<10} http://127.0.0.1:{port}")
    try:
        for process in processes:
            process.wait()
    except KeyboardInterrupt:
        pass
    finally:
        for process in processes:
            if process.poll() is None:
                process.send_signal(signal.SIGINT)
        for process in processes:
            process.wait()


if __name__ == "__main__":
    main()
