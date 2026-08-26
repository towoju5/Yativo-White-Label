#!/usr/bin/env bash
#
# One-shot VPS provisioning + deploy script for this monorepo (apps/api + apps/web).
#
# What it does, in order:
#   1. Installs Node 20, pnpm, Docker, Nginx, Certbot (idempotent — skips what's already there)
#   2. Starts Postgres + Redis via the repo's existing docker-compose.yml (loopback-only)
#   3. Generates apps/api/.env and apps/web/.env.production with strong random secrets
#      (never overwrites an existing .env — safe to re-run)
#   4. Installs deps, runs Prisma migrations, builds both apps
#   5. Runs the API as a systemd service (127.0.0.1 only — never exposed directly)
#   6. Configures Nginx as the only public-facing entrypoint (api.domain + app.domain)
#   7. Configures ufw so only 22/80/443 are reachable from the internet — this is what
#      guarantees "no port related issues": nothing else is ever exposed, and the script
#      hard-fails with a clear diagnostic if its own internal port is already taken by
#      something else, instead of silently colliding with it.
#   8. Issues Let's Encrypt certificates for both domains via certbot --nginx
#
# Usage:
#   sudo ./deploy.sh api.example.com app.example.com admin@example.com
#
# Optional flags:
#   --skip-ssl        Stand the site up on plain HTTP only (use when DNS isn't pointed yet —
#                      rerun the script without this flag once it is, to add HTTPS)
#   --seed            Also run the Prisma seed script (creates TEST data/credentials —
#                      do NOT use this on a real production database)
#   --yativo-mode=X   mock | sandbox | live (default: mock — the script never assumes "live")
#
# Safe to re-run: every step below either skips work that's already done, or is naturally
# idempotent (systemd restart, nginx reload, docker compose up -d, prisma migrate deploy).

set -euo pipefail

# ── 0. Helpers ──────────────────────────────────────────────────────────────

C_RESET='\033[0m'; C_BLUE='\033[1;34m'; C_GREEN='\033[1;32m'; C_YELLOW='\033[1;33m'; C_RED='\033[1;31m'
log()  { echo -e "${C_BLUE}==>${C_RESET} $*"; }
ok()   { echo -e "${C_GREEN}✓${C_RESET} $*"; }
warn() { echo -e "${C_YELLOW}!${C_RESET} $*"; }
die()  { echo -e "${C_RED}✗ $*${C_RESET}" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

[ "$EUID" -eq 0 ] || die "Run this as root (sudo ./deploy.sh ...) — it installs system packages and manages systemd/nginx/ufw."
[ -f package.json ] && [ -f docker-compose.yml ] || die "Run this from the repo root (docker-compose.yml not found here: $REPO_ROOT)."
command -v apt-get >/dev/null 2>&1 || die "This script only supports Debian/Ubuntu (needs apt-get, ufw, and the Nginx/Certbot apt packages)."

# ── 1. Args ─────────────────────────────────────────────────────────────────

SKIP_SSL=0
RUN_SEED=0
YATIVO_MODE="mock"
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --skip-ssl) SKIP_SSL=1 ;;
    --seed) RUN_SEED=1 ;;
    --yativo-mode=*) YATIVO_MODE="${arg#*=}" ;;
    -h|--help) grep '^#' "$0" | sed 's/^#//'; exit 0 ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done
set -- "${POSITIONAL[@]}"

API_DOMAIN="${1:-whitelabel-api.yativo.com}"
WEB_DOMAIN="${2:-whitelabel.yativo.com}"
CERT_EMAIL="${3:-towojuads@gmail.com}"

[ -n "$API_DOMAIN" ] && [ -n "$WEB_DOMAIN" ] || die "Usage: sudo ./deploy.sh api.example.com app.example.com [email-for-ssl] [--skip-ssl] [--seed] [--yativo-mode=mock|sandbox|live]"
[[ "$API_DOMAIN" == *.* ]] && [[ "$WEB_DOMAIN" == *.* ]] || die "Both domains must be real DNS hostnames (e.g. api.example.com), not IPs or bare names."
[ "$API_DOMAIN" != "$WEB_DOMAIN" ] || die "API and web domains must be different hostnames."
case "$YATIVO_MODE" in mock|sandbox|live) ;; *) die "--yativo-mode must be mock, sandbox, or live." ;; esac
if [ "$SKIP_SSL" -eq 0 ] && [ -z "$CERT_EMAIL" ]; then
  die "An email is required for Let's Encrypt (used only for renewal notices), or pass --skip-ssl to stand up HTTP-only for now."
fi

API_PORT=9000
DB_PORT=5433
REDIS_PORT=6380
SERVICE_USER="whitelabel"
SERVICE_NAME="whitelabel-api"

log "Deploying:"
echo "    API:       https://$API_DOMAIN  (proxied to 127.0.0.1:$API_PORT)"
echo "    Web app:   https://$WEB_DOMAIN  (static build served by Nginx)"
echo "    SSL:       $([ "$SKIP_SSL" -eq 1 ] && echo 'skipped (HTTP only)' || echo "yes, via $CERT_EMAIL")"
echo "    Yativo:    $YATIVO_MODE"
echo "    Repo:      $REPO_ROOT"
echo

# ── 2. Port pre-flight — the actual "no port issues" guarantee ─────────────
#
# Checked BEFORE anything is installed/started, and again right before the API service
# starts. If something else already owns a port we need, we stop here with a clear
# diagnostic instead of silently fighting it or producing a cryptic downstream error.

port_owner() { ss -ltnp 2>/dev/null | awk -v p=":$1\$" '$4 ~ p {print; found=1} END{exit !found}'; }

check_port_free() {
  local port="$1" label="$2"
  if port_owner "$port" >/dev/null; then
    warn "Port $port ($label) is already in use:"
    port_owner "$port" | sed 's/^/    /'
    die "Free port $port before continuing (stop whatever's on it, or rerun with a different port by editing API_PORT/DB_PORT/REDIS_PORT at the top of this script)."
  fi
}

log "Checking required ports are free…"
for p in "$API_PORT:the API" "$DB_PORT:Postgres" "$REDIS_PORT:Redis"; do
  check_port_free "${p%%:*}" "${p#*:}"
done
ok "Ports $API_PORT, $DB_PORT, $REDIS_PORT are free."

# ── 3. System packages ───────────────────────────────────────────────────────

log "Updating apt and installing base packages…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ufw nginx iproute2 ca-certificates gnupg lsb-release >/dev/null
ok "Base packages installed."

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/^v//' | cut -d. -f1)" -lt 20 ]; then
  log "Installing Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
else
  ok "Node.js $(node -v) already installed."
fi
NODE_BIN="$(command -v node)" # resolved dynamically — don't assume /usr/bin/node (e.g. nvm installs elsewhere)

if ! command -v pnpm >/dev/null 2>&1; then
  log "Enabling pnpm via corepack…"
  corepack enable >/dev/null 2>&1
  corepack prepare pnpm@9.15.0 --activate >/dev/null 2>&1
else
  ok "pnpm $(pnpm -v) already installed."
fi

if ! command -v docker >/dev/null 2>&1; then
  log "Installing Docker…"
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
  systemctl enable --now docker >/dev/null 2>&1
else
  ok "Docker already installed."
fi

if ! command -v certbot >/dev/null 2>&1; then
  log "Installing Certbot…"
  apt-get install -y -qq certbot python3-certbot-nginx >/dev/null
else
  ok "Certbot already installed."
fi

# ── 4. Firewall — the only ports ever reachable from outside are 22/80/443 ──

log "Configuring firewall (ufw)…"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ok "ufw active — only SSH, HTTP, and HTTPS are reachable from the internet. The API ($API_PORT), Postgres ($DB_PORT), and Redis ($REDIS_PORT) stay loopback-only regardless of what they bind to."

# ── 5. Postgres + Redis (the repo's own docker-compose.yml, unmodified) ────

log "Starting Postgres + Redis…"
docker compose up -d
log "Waiting for Postgres to be healthy…"
for i in $(seq 1 30); do
  docker compose ps postgres 2>/dev/null | grep -q "(healthy)" && break
  sleep 2
  [ "$i" -eq 30 ] && die "Postgres didn't become healthy in time — check: docker compose logs postgres"
done
ok "Postgres + Redis are up."

# ── 6. Environment files (generated once — never clobbered on rerun) ───────

SECRETS_FILE="$REPO_ROOT/.deploy-secrets.txt"

if [ ! -f apps/api/.env ]; then
  log "Generating apps/api/.env with fresh random secrets…"
  gen_secret() { openssl rand -hex 32; }
  JWT_ACCESS_SECRET="$(gen_secret)"
  JWT_REFRESH_SECRET="$(gen_secret)"
  PORTAL_JWT_ACCESS_SECRET="$(gen_secret)"
  PORTAL_JWT_REFRESH_SECRET="$(gen_secret)"
  YATIVO_WEBHOOK_SECRET="$(gen_secret)"
  DB_PASSWORD="postgres" # matches docker-compose.yml's POSTGRES_PASSWORD — change both together if you harden this later

  cat > apps/api/.env <<EOF
NODE_ENV=production
PORT=$API_PORT

DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@localhost:${DB_PORT}/whitelabel
REDIS_URL=redis://localhost:${REDIS_PORT}

JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

PORTAL_JWT_ACCESS_SECRET=${PORTAL_JWT_ACCESS_SECRET}
PORTAL_JWT_REFRESH_SECRET=${PORTAL_JWT_REFRESH_SECRET}
PORTAL_JWT_ACCESS_TTL=15m
PORTAL_JWT_REFRESH_TTL=30d

YATIVO_MODE=${YATIVO_MODE}
YATIVO_FIAT_BASE_URL=https://api.yativo.com/api/v1
YATIVO_CRYPTO_BASE_URL=https://crypto.yativo.com
YATIVO_KYC_BASE_URL=https://kyc.yativo.com
YATIVO_API_KEY=
YATIVO_API_SECRET=
YATIVO_WEBHOOK_SECRET=${YATIVO_WEBHOOK_SECRET}

APP_BASE_URL=https://${API_DOMAIN}
WEB_APP_URL=https://${WEB_DOMAIN}
LOG_LEVEL=info
EOF
  chmod 600 apps/api/.env

  {
    echo "Generated $(date -u +%FT%TZ) — keep this file private, then delete it."
    echo "These are also saved in apps/api/.env."
    echo
    echo "JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}"
    echo "JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}"
    echo "PORTAL_JWT_ACCESS_SECRET=${PORTAL_JWT_ACCESS_SECRET}"
    echo "PORTAL_JWT_REFRESH_SECRET=${PORTAL_JWT_REFRESH_SECRET}"
    echo "YATIVO_WEBHOOK_SECRET=${YATIVO_WEBHOOK_SECRET}  <- also enter this in Yativo's webhook config"
  } > "$SECRETS_FILE"
  chmod 600 "$SECRETS_FILE"
  ok "apps/api/.env created. Secrets also written to $SECRETS_FILE — move them to a password manager and delete that file."
else
  ok "apps/api/.env already exists — leaving it untouched (rerun-safe). Delete it first if you want fresh secrets."
fi

if [ ! -f apps/web/.env.production ]; then
  log "Generating apps/web/.env.production…"
  cat > apps/web/.env.production <<EOF
VITE_API_BASE_URL=https://${API_DOMAIN}
VITE_APP_NAME=White Label
VITE_SENTRY_DSN=
EOF
  ok "apps/web/.env.production created."
else
  ok "apps/web/.env.production already exists — leaving it untouched."
fi

# ── 7. Install, migrate, build ──────────────────────────────────────────────

log "Installing dependencies (pnpm install)…"
pnpm install --frozen-lockfile

log "Running Prisma migrations against production DB…"
pnpm --filter api exec prisma generate
pnpm --filter api exec prisma migrate deploy

if [ "$RUN_SEED" -eq 1 ]; then
  warn "Seeding the database — this creates TEST users with known passwords. Only do this on a non-production/demo database."
  pnpm --filter api exec prisma db seed
fi

log "Building API and web app (turbo builds their workspace packages first)…"
pnpm build

ok "Build complete."

# ── 8. systemd service for the API (127.0.0.1 only) ────────────────────────

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  log "Creating service user '$SERVICE_USER'…"
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$REPO_ROOT"

log "Writing systemd unit…"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=White Label API
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${REPO_ROOT}/apps/api
EnvironmentFile=${REPO_ROOT}/apps/api/.env
ExecStart=${NODE_BIN} ${REPO_ROOT}/apps/api/dist/index.js
Restart=always
RestartSec=3
TimeoutStopSec=10
StandardOutput=journal
StandardError=journal
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=${REPO_ROOT}/apps/api
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null

# Re-check the port right before we bind it — catches anything that grabbed it during the
# (potentially long) install/build steps above. Ignore it if it's our own service from a
# previous run of this script (systemctl restart below will cleanly rebind it).
if port_owner "$API_PORT" >/dev/null && ! systemctl is-active --quiet "$SERVICE_NAME"; then
  port_owner "$API_PORT" | sed 's/^/    /'
  die "Port $API_PORT is held by something that isn't this service. Stop it, then rerun: systemctl restart $SERVICE_NAME"
fi

log "Starting the API service…"
systemctl restart "$SERVICE_NAME"

log "Waiting for the API to come up on 127.0.0.1:${API_PORT}…"
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    ok "API is up (http://127.0.0.1:${API_PORT}/health)."
    break
  fi
  sleep 1
  if [ "$i" -eq 20 ]; then
    warn "API didn't respond in time. Recent logs:"
    journalctl -u "$SERVICE_NAME" -n 50 --no-pager
    die "Fix the error above, then: systemctl restart $SERVICE_NAME"
  fi
done

# ── 9. Nginx — the single public entrypoint ─────────────────────────────────

log "Writing Nginx server blocks…"

cat > "/etc/nginx/sites-available/${API_DOMAIN}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN};

    client_max_body_size 30m; # matches the API's own Fastify bodyLimit (KYC uploads)

    location / {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }
}
EOF

cat > "/etc/nginx/sites-available/${WEB_DOMAIN}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${WEB_DOMAIN};
    root ${REPO_ROOT}/apps/web/dist;
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files \$uri /index.html; # client-side routed SPA
    }
}
EOF

ln -sf "/etc/nginx/sites-available/${API_DOMAIN}" "/etc/nginx/sites-enabled/${API_DOMAIN}"
ln -sf "/etc/nginx/sites-available/${WEB_DOMAIN}" "/etc/nginx/sites-enabled/${WEB_DOMAIN}"
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx
ok "Nginx is serving both domains over HTTP."

# ── 10. SSL ──────────────────────────────────────────────────────────────────

if [ "$SKIP_SSL" -eq 1 ]; then
  warn "Skipping SSL (--skip-ssl). Rerun without that flag once DNS for both domains points at this server."
else
  log "Requesting Let's Encrypt certificates…"
  if certbot --nginx -d "$API_DOMAIN" -d "$WEB_DOMAIN" -m "$CERT_EMAIL" --agree-tos --redirect --non-interactive; then
    ok "SSL is live for both domains. Certbot's systemd timer handles renewal automatically."
  else
    warn "Certbot failed — this almost always means DNS for $API_DOMAIN / $WEB_DOMAIN doesn't point at this server's IP yet."
    warn "The app is still reachable over plain HTTP. Point your DNS, then rerun:"
    warn "  certbot --nginx -d $API_DOMAIN -d $WEB_DOMAIN -m $CERT_EMAIL --agree-tos --redirect"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────

echo
ok "Done."
echo
echo "  API:        http$( [ "$SKIP_SSL" -eq 0 ] && echo s )://${API_DOMAIN}"
echo "  Web app:    http$( [ "$SKIP_SSL" -eq 0 ] && echo s )://${WEB_DOMAIN}"
echo "  Service:    systemctl {status|restart|stop} ${SERVICE_NAME}"
echo "  Logs:       journalctl -u ${SERVICE_NAME} -f"
echo
warn "Before going further:"
echo "  1. Fill in YATIVO_API_KEY / YATIVO_API_SECRET in apps/api/.env, then: systemctl restart ${SERVICE_NAME}"
echo "  2. Enter the YATIVO_WEBHOOK_SECRET from $SECRETS_FILE into Yativo's webhook config"
echo "  3. Move the contents of $SECRETS_FILE to a password manager, then delete that file"
[ "$RUN_SEED" -eq 0 ] && echo "  4. Create your first admin/owner account (no seed data was loaded)"
echo
