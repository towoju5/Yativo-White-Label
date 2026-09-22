#!/usr/bin/env bash
# Start the API and web UI locally for manual testing.
#   API : http://localhost:3333
#   Web : http://localhost:3334
#
# Ports are overridden only for this run (via env vars) — apps/api/.env and
# apps/web/.env are left untouched.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

API_PORT="${API_PORT:-3333}"
WEB_PORT="${WEB_PORT:-3334}"

if command -v docker >/dev/null 2>&1 && [ -f docker-compose.yml ]; then
  echo "==> Ensuring Postgres/Redis are up (docker compose, ports overridden to avoid clashing with other local projects)"
  DB_PORT="${DB_PORT:-5445}" REDIS_PORT="${REDIS_PORT:-6390}" docker compose up -d postgres redis
else
  echo "==> Skipping docker compose (docker not found or no docker-compose.yml) — make sure Postgres/Redis are already running"
fi

pids=()
cleanup() {
  echo "==> Stopping dev servers"
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "==> Starting API on port ${API_PORT}"
(cd apps/api && PORT="${API_PORT}" pnpm dev) &
pids+=($!)

echo "==> Starting web UI on port ${WEB_PORT} (API at http://localhost:${API_PORT})"
(cd apps/web && VITE_API_BASE_URL="http://localhost:${API_PORT}" pnpm dev --port "${WEB_PORT}" --strictPort) &
pids+=($!)

wait
