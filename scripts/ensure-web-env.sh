#!/usr/bin/env bash
#
# Makes sure apps/web/.env.production exists with VITE_API_BASE_URL set, creating it if needed.
# Vite bakes this URL into the bundle at BUILD time — without it the frontend falls back to
# http://localhost:4000 and every visitor's browser tries to reach the API on their own machine.
#
#   ./scripts/ensure-web-env.sh                          # auto-detect the API URL
#   ./scripts/ensure-web-env.sh https://api.example.com  # or pass it explicitly
#
# Auto-detection: reads this checkout's API port (PORT in apps/api/.env), finds the Nginx site
# that proxies to 127.0.0.1:<PORT> (written by deploy.sh), and uses its server_name — https if
# that site has a certificate (certbot), http otherwise. Never overwrites an existing value.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_ENV="${REPO_ROOT}/apps/web/.env.production"
API_ENV="${REPO_ROOT}/apps/api/.env"
API_URL="${1:-}"

current="$(grep -oP '^VITE_API_BASE_URL=\K.+' "$WEB_ENV" 2>/dev/null || true)"
if [ -n "$current" ] && [ -z "$API_URL" ]; then
  echo "✓ apps/web/.env.production already sets VITE_API_BASE_URL=${current}"
  exit 0
fi

if [ -z "$API_URL" ]; then
  port="$(grep -oP '^PORT=\K[0-9]+' "$API_ENV" 2>/dev/null || true)"
  [ -n "$port" ] || { echo "✗ Can't auto-detect: no PORT in ${API_ENV}. Pass the URL: $0 https://api.yourdomain.com" >&2; exit 1; }

  site=""
  for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do
    [ -f "$f" ] || continue
    if grep -qE "proxy_pass[[:space:]]+http://(127\.0\.0\.1|localhost):${port}[;/]" "$f"; then site="$f"; break; fi
  done
  [ -n "$site" ] || { echo "✗ Can't auto-detect: no Nginx site proxies to 127.0.0.1:${port}. Pass the URL: $0 https://api.yourdomain.com" >&2; exit 1; }

  domain="$(grep -oP '^\s*server_name\s+\K[^\s;]+' "$site" | head -1)"
  [ -n "$domain" ] || { echo "✗ Can't auto-detect: no server_name in ${site}. Pass the URL: $0 https://api.yourdomain.com" >&2; exit 1; }
  scheme="http"
  grep -qE 'ssl_certificate|listen[^;]*443' "$site" && scheme="https"
  API_URL="${scheme}://${domain}"
  echo "==> Detected API URL ${API_URL} (from ${site})"
fi
API_URL="${API_URL%/}"

if [ -f "$WEB_ENV" ]; then
  if grep -q '^VITE_API_BASE_URL=' "$WEB_ENV"; then
    sed -i "s|^VITE_API_BASE_URL=.*|VITE_API_BASE_URL=${API_URL}|" "$WEB_ENV"
  else
    printf 'VITE_API_BASE_URL=%s\n' "$API_URL" >> "$WEB_ENV"
  fi
else
  cat > "$WEB_ENV" <<EOF
VITE_API_BASE_URL=${API_URL}
VITE_APP_NAME=White Label
VITE_SENTRY_DSN=
EOF
fi
echo "✓ apps/web/.env.production: VITE_API_BASE_URL=${API_URL}"
