#!/usr/bin/env bash
# Smart Parking AI — one-click launcher (Linux / macOS).
# Sets up a local Python environment, starts the app, and opens it in your browser.
set -e
cd "$(dirname "$0")"

PORT="${PYTHON_API_PORT:-8080}"
URL="http://localhost:${PORT}"

echo "🅿️  Smart Parking AI — starting…"

# Create/activate a local virtual environment.
if [ ! -d ".venv" ]; then
    echo "→ Creating virtual environment (first run only)…"
    python3 -m venv .venv
fi
# shellcheck disable=SC1091
source .venv/bin/activate

echo "→ Installing dependencies…"
pip install -q --upgrade pip >/dev/null 2>&1 || true
pip install -q -r requirements.txt

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "ℹ️  No .env found. Copy .env.example to .env and add GOOGLE_MAPS_API_KEY for live data."
    echo "    (The app still runs without a key, using density-based estimates.)"
fi

# Open the browser shortly after the server starts.
( sleep 2; (xdg-open "$URL" >/dev/null 2>&1 || open "$URL" >/dev/null 2>&1 || true) ) &

echo "→ Open: $URL  (press Ctrl+C to stop)"
cd python-api
exec python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
