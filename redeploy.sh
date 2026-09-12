#!/usr/bin/env bash
#
# Pulls the latest code, applies pending migrations, rebuilds everything in the right
# dependency order, and restarts the API service. Run this on the production server any time
# there's a new commit to pick up — NOT the same as deploy.sh, which is one-time provisioning.
#
# Usage:
#   ./redeploy.sh                        # uses the default service name (whitelabel-api.service)
#   ./redeploy.sh my-other-service.service
#
# Safe to re-run: git pull/pnpm install/migrate deploy/build are all naturally idempotent, and
# this stops at the first failure (set -e) rather than restarting a service with a broken build.

set -euo pipefail

SERVICE_NAME="${1:-whitelabel-api.service}"

C_RESET='\033[0m'; C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_RED='\033[1;31m'
log()  { echo -e "${C_BLUE}==>${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}✓${C_RESET} $*"; }
die()  { echo -e "${C_RED}✗ $*${C_RESET}" >&2; exit 1; }

# Always operate from this script's own directory, regardless of where it's invoked from.
cd "$(dirname "${BASH_SOURCE[0]}")"

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
