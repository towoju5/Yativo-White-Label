#!/usr/bin/env bash
#
# One-time setup for `git push production master` deploys.
#
# Creates a bare Git repo on this server and installs post-receive as its
# hook. From then on, pushing to that bare repo re-checks-out the code into
# WORK_TREE and runs post-receive's install/migrate/build/restart steps.
#
# This does NOT touch Nginx, ufw, or the whitelabel system user — it only
# creates the bare repo + hook. Safe to re-run (idempotent): re-copies the
# hook file so you can update post-receive.sh and rerun this to pick it up.
#
# Usage:
#   sudo ./setup-post-receive.sh [bare-repo-path] [work-tree-path]
#
# Defaults match the current server layout:
#   bare-repo-path = /root/white-label.git
#   work-tree-path = /opt/yativo-white-label

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[ "$EUID" -eq 0 ] || { echo "Run as root: sudo ./setup-post-receive.sh" >&2; exit 1; }
[ -f "$REPO_ROOT/post-receive" ] || { echo "post-receive not found next to this script in $REPO_ROOT" >&2; exit 1; }

BARE_REPO="${1:-/root/white-label.git}"
WORK_TREE="${2:-/opt/yativo-white-label}"

if [ ! -d "$BARE_REPO" ]; then
  echo "==> Creating bare repo at $BARE_REPO"
  git init --bare "$BARE_REPO"
else
  echo "==> Bare repo already exists at $BARE_REPO — reusing it"
fi

echo "==> Installing post-receive hook"
cp "$REPO_ROOT/post-receive" "$BARE_REPO/hooks/post-receive"
chmod +x "$BARE_REPO/hooks/post-receive"

if ! grep -q "^WORK_TREE=\"$WORK_TREE\"" "$BARE_REPO/hooks/post-receive"; then
  echo "==> Pointing the hook's WORK_TREE at $WORK_TREE"
  sed -i "s|^WORK_TREE=\".*\"|WORK_TREE=\"$WORK_TREE\"|" "$BARE_REPO/hooks/post-receive"
fi

SERVER_IP="$(curl -fsS -4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"

echo
echo "Done. From your local machine (using the server's IP — whitelabel-api.yativo.com"
echo "isn't resolving to a reachable host over SSH yet):"
echo "  git remote remove production 2>/dev/null"
echo "  git remote add production root@${SERVER_IP}:$BARE_REPO"
echo "  git push production master"
