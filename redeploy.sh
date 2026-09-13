#!/usr/bin/env bash
#
# Pulls the latest code, applies pending migrations, rebuilds everything in the right
# dependency order, and restarts the API service. Run this on the production server any time
# there's a new commit to pick up — NOT the same as deploy.sh, which is one-time provisioning.
#
# Usage:
#   ./redeploy.sh                        # auto-detects which systemd service runs THIS checkout
#   ./redeploy.sh my-other-service.service   # override, e.g. if detection is ambiguous
#
# Safe to re-run: git pull/pnpm install/migrate deploy/build are all naturally idempotent, and
# this stops at the first failure (set -e) rather than restarting a service with a broken build.
#
# Multi-instance safety: this used to default to the fixed name "whitelabel-api.service" when
# no argument was given — fine for a single deployment, but a real footgun with more than one
# copy of this repo on the same box (see deploy.sh's "Running a second, fully independent copy"
# section). Running this with no argument from a second checkout would rebuild ITS code but
# restart the FIRST checkout's service instead — reporting success the whole time, while the
# checkout you actually meant to redeploy never restarts. Instead, with no argument, this now
# looks up whichever systemd unit has WorkingDirectory=<this repo>/apps/api — the one fact that's
# unambiguous per checkout no matter what its service happens to be named — and refuses to guess
# if that's not exactly one unit.

set -euo pipefail

C_RESET='\033[0m'; C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_RED='\033[1;31m'
log()  { echo -e "${C_BLUE}==>${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}✓${C_RESET} $*"; }
die()  { echo -e "${C_RED}✗ $*${C_RESET}" >&2; exit 1; }

# Always operate from this script's own directory, regardless of where it's invoked from.
cd "$(dirname "${BASH_SOURCE[0]}")"
REPO_ROOT="$(pwd)"

SERVICE_NAME="${1:-}"
if [ -z "$SERVICE_NAME" ]; then
  log "Detecting which systemd service runs this checkout (${REPO_ROOT})…"
  MATCHES=()
  for unit_file in /etc/systemd/system/*.service; do
    [ -f "$unit_file" ] || continue
    wd="$(grep -oP '^WorkingDirectory=\K.*' "$unit_file" 2>/dev/null || true)"
    [ "$wd" = "${REPO_ROOT}/apps/api" ] && MATCHES+=("$(basename "$unit_file")")
  done
  case "${#MATCHES[@]}" in
    1)
      SERVICE_NAME="${MATCHES[0]}"
      ok "Found: ${SERVICE_NAME}"
      ;;
    0)
      die "No systemd service has WorkingDirectory=${REPO_ROOT}/apps/api — this checkout may not be deployed yet (run deploy.sh first), or pass the service name explicitly: ./redeploy.sh <service-name>.service"
      ;;
    *)
      die "Multiple systemd services claim WorkingDirectory=${REPO_ROOT}/apps/api (${MATCHES[*]}) — refusing to guess. Pass the right one explicitly: ./redeploy.sh <service-name>.service"
      ;;
  esac
else
  log "Using explicitly given service: ${SERVICE_NAME}"
fi

log "Pulling latest code…"
git pull
ok "Up to date at $(git rev-parse --short HEAD)"

log "Installing dependencies…"
pnpm install

log "Applying pending database migrations…"
(cd apps/api && npx prisma migrate deploy && npx prisma generate)
ok "Database schema up to date"

log "Building all packages (shared-types, yativo-sdk, api, web)…"
pnpm build
ok "Build finished"

log "Restarting ${SERVICE_NAME}…"
sudo systemctl restart "$SERVICE_NAME"

# Give it a moment to either come up cleanly or crash-loop, so a bad deploy is caught here
# instead of silently left running the old process.
sleep 2
if systemctl is-active --quiet "$SERVICE_NAME"; then
  ok "${SERVICE_NAME} is running"
else
  echo
  journalctl -u "$SERVICE_NAME" -n 40 --no-pager
  die "${SERVICE_NAME} failed to start — see the log above. The old build/migrations are already applied; fix the error and restart manually: sudo systemctl restart ${SERVICE_NAME}"
fi

echo
log "Done. Hard-refresh the browser to pick up the new frontend bundle (browsers cache the old JS)."
