#!/usr/bin/env bash
#
# Tears down THIS PROJECT's own service + database, for a fresh deploy.sh run.
#
# Scope — deliberately narrow:
#   - Stops and removes the "whitelabel-api" systemd service.
#   - Stops and removes this project's own Docker containers AND volumes
#     (docker compose down -v against THIS repo's docker-compose.yml) —
#     this permanently deletes the Postgres data (customers, transactions,
#     KYC records, wallets — everything in the "whitelabel" database) and
#     the Redis data.
#
# Explicitly does NOT touch:
#   - Nginx. No config files removed, no reload, no restart. Other sites
#     on this box keep running untouched.
#   - ufw / firewall rules.
#   - The "whitelabel" system user.
#   - apps/api/.env or apps/web/.env.production (left alone — delete them
#     yourself first if you also want deploy.sh to generate fresh secrets).
#
# No backup is taken. This is irreversible. Run only if you're certain.
#
# Usage: sudo ./teardown.sh --yes-delete-database

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

[ "$EUID" -eq 0 ] || { echo "Run as root: sudo ./teardown.sh --yes-delete-database" >&2; exit 1; }
[ "${1:-}" = "--yes-delete-database" ] || {
  echo "This permanently deletes the Postgres database for this project (no backup)." >&2
  echo "Rerun as: sudo ./teardown.sh --yes-delete-database" >&2
  exit 1
}

echo "==> Stopping whitelabel-api service"
systemctl stop whitelabel-api 2>/dev/null || true
systemctl disable whitelabel-api 2>/dev/null || true
rm -f /etc/systemd/system/whitelabel-api.service
systemctl daemon-reload

echo "==> Removing this project's containers + volumes (Postgres + Redis data)"
docker compose down -v

echo "==> Done. Nginx, ufw, and the whitelabel user were left untouched."
echo "    Re-run ./deploy.sh <api-domain> <web-domain> <email> for the fresh install."
