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
#   --skip-ssl          Stand the site up on plain HTTP only (use when DNS isn't pointed yet —
#                        rerun the script without this flag once it is, to add HTTPS)
#   --seed              Also run the Prisma seed script (creates TEST data/credentials —
#                        do NOT use this on a real production database)
#   --yativo-mode=X     mock | sandbox | live (default: mock — the script never assumes "live")
#   --instance=NAME     Short name for this deployment (used in the systemd service name,
#                        the Linux service user, and the Docker Compose project name so
#                        multiple copies never collide). Auto-derived from the API domain
#                        if omitted — pass this only if you want a friendlier name.
#   --api-port=PORT     Pin the API's loopback port instead of auto-picking one.
#   --db-port=PORT      Pin this instance's Postgres loopback port.
#   --redis-port=PORT   Pin this instance's Redis loopback port.
#   --cpu-quota=X       Optional systemd CPUQuota for the API service (e.g. "50%") — caps
#                        how much CPU this instance can take from others on the same VPS.
#   --memory-max=X      Optional systemd MemoryMax for the API service (e.g. "512M").
#
# Safe to re-run: every step below either skips work that's already done, or is naturally
# idempotent (systemd restart, nginx reload, docker compose up -d, prisma migrate deploy).
# Rerunning with the SAME domains reuses the SAME ports/service/user it picked the first
# time — ports are only (re-)picked when this instance has no prior config to read back.
#
# ── Running a second, fully independent copy on the same VPS ──────────────────
# Each copy needs its own working directory (this script derives everything — ports,
# .env files, build output, systemd unit — from "where it lives" and "which domains you
# pass it"), so:
#   git clone <this repo> /opt/whitelabel-2 && cd /opt/whitelabel-2
#   sudo ./deploy.sh api2.example.com app2.example.com admin@example.com
# That's it — no shared state with the first copy. It gets its own Postgres/Redis
# containers (separate Docker Compose project, separate volumes), its own API port, its
# own systemd service + Linux user, and its own Nginx server blocks/TLS certs, so neither
# copy's load, crashes, restarts, or DB can affect the other's uptime.

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
INSTANCE_ARG=""
API_PORT_ARG=""
DB_PORT_ARG=""
REDIS_PORT_ARG=""
CPU_QUOTA=""
MEMORY_MAX=""
POSITIONAL=()
for arg in "$@"; do
  case "$arg" in
    --skip-ssl) SKIP_SSL=1 ;;
    --seed) RUN_SEED=1 ;;
    --yativo-mode=*) YATIVO_MODE="${arg#*=}" ;;
    --instance=*) INSTANCE_ARG="${arg#*=}" ;;
    --api-port=*) API_PORT_ARG="${arg#*=}" ;;
    --db-port=*) DB_PORT_ARG="${arg#*=}" ;;
    --redis-port=*) REDIS_PORT_ARG="${arg#*=}" ;;
    --cpu-quota=*) CPU_QUOTA="${arg#*=}" ;;
    --memory-max=*) MEMORY_MAX="${arg#*=}" ;;
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

# ── 2. Instance identity — lets multiple independent copies of this repo run ──
# on the same VPS (different domains, different DB/Redis, different systemd unit and
# Linux user) without colliding. Derived from the API domain unless --instance= is given.
#
# Existing deployments (this exact directory was already deployed by an older version of
# this script) are a special case: they're already running under the legacy fixed names
# ("whitelabel-api" service/user, and whatever Docker Compose's implicit default project
# name already is here). We deliberately keep using those on every rerun instead of
# switching to the new per-instance scheme — otherwise a routine update would spin up a
# second systemd service alongside the old one, and worse, point Docker Compose at a
# brand-new empty project instead of your real running Postgres/Redis containers.

slugify() { echo -n "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'; }

INSTANCE_SLUG="$(slugify "${INSTANCE_ARG:-$API_DOMAIN}")"
INSTANCE_HASH="$(echo -n "$API_DOMAIN" | sha1sum | cut -c1-6)"

if [ -f apps/api/.env ]; then
  log "Existing deployment detected in this directory — keeping its legacy service/user/Compose project for continuity."
  SERVICE_USER="whitelabel"
  SERVICE_NAME="whitelabel-api"
  # Left empty (and NOT exported) so docker compose keeps resolving its own existing
  # implicit default (based on this directory), exactly as it always has here.
  COMPOSE_PROJECT_NAME=""
else
  SERVICE_USER="wl-${INSTANCE_HASH}"                                 # <=32 chars, unique per instance
  SERVICE_NAME="whitelabel-api-${INSTANCE_SLUG:0:40}-${INSTANCE_HASH}"
  COMPOSE_PROJECT_NAME="whitelabel-${INSTANCE_SLUG:0:40}-${INSTANCE_HASH}"
  export COMPOSE_PROJECT_NAME
fi

# ── 3. Ports — the actual "no port issues" guarantee ────────────────────────
#
# Each instance gets its own API/Postgres/Redis loopback port. Checked BEFORE anything
# is installed/started, and again right before the API service starts. If something else
# already owns a port we need, we stop here with a clear diagnostic instead of silently
# fighting it or producing a cryptic downstream error.
#
# On a RERUN of this same instance, we reuse whatever ports it's already configured with
# (read back from its own env files) instead of re-picking — so a redeploy never
# renumbers a running instance out from under itself. For a brand-new instance: use
# --api-port/--db-port/--redis-port if given, otherwise auto-pick the next free port
# starting at the defaults below (so a second copy "just works" with no flags at all).

port_owner() { ss -ltnp 2>/dev/null | awk -v p=":$1\$" '$4 ~ p {print; found=1} END{exit !found}'; }

check_port_free() {
  local port="$1" label="$2"
  if port_owner "$port" >/dev/null; then
    warn "Port $port ($label) is already in use:"
    port_owner "$port" | sed 's/^/    /'
    die "Free port $port before continuing, or pick a different one with --api-port/--db-port/--redis-port."
  fi
}

find_free_port() {
  local p="$1"
  for _ in $(seq 1 50); do
    port_owner "$p" >/dev/null || { echo "$p"; return 0; }
    p=$((p + 1))
  done
  die "Could not find a free port starting at $1 after 50 attempts."
}

# resolve_port EXISTING FLAG DEFAULT_BASE LABEL
resolve_port() {
  local existing="$1" flag="$2" base="$3" label="$4"
  if [ -n "$existing" ]; then
    echo "$existing"
  elif [ -n "$flag" ]; then
    check_port_free "$flag" "$label"
    echo "$flag"
  else
    find_free_port "$base"
  fi
}

EXISTING_API_PORT=""
[ -f apps/api/.env ] && EXISTING_API_PORT="$(grep -oP '(?<=^PORT=).*' apps/api/.env || true)"
EXISTING_DB_PORT=""
EXISTING_REDIS_PORT=""
if [ -f "$REPO_ROOT/.env" ]; then
  EXISTING_DB_PORT="$(grep -oP '(?<=^DB_PORT=).*' "$REPO_ROOT/.env" || true)"
  EXISTING_REDIS_PORT="$(grep -oP '(?<=^REDIS_PORT=).*' "$REPO_ROOT/.env" || true)"
fi
# Deployments made before DB_PORT/REDIS_PORT existed as explicit keys never wrote them to
# root .env — but the real port each is already running on is still recorded in apps/api/.env's
# connection strings, so fall back to reading it from there rather than auto-picking a new
# (wrong) port out from under an already-running database.
if [ -z "$EXISTING_DB_PORT" ] && [ -f apps/api/.env ]; then
  EXISTING_DB_PORT="$(grep -oP '^DATABASE_URL=.*localhost:\K[0-9]+' apps/api/.env || true)"
fi
if [ -z "$EXISTING_REDIS_PORT" ] && [ -f apps/api/.env ]; then
  EXISTING_REDIS_PORT="$(grep -oP '^REDIS_URL=.*localhost:\K[0-9]+' apps/api/.env || true)"
fi

log "Resolving ports for instance '${INSTANCE_SLUG}' (${SERVICE_NAME})…"
API_PORT="$(resolve_port "$EXISTING_API_PORT" "$API_PORT_ARG" 9000 "the API")"
DB_PORT="$(resolve_port "$EXISTING_DB_PORT" "$DB_PORT_ARG" 5433 "Postgres")"
REDIS_PORT="$(resolve_port "$EXISTING_REDIS_PORT" "$REDIS_PORT_ARG" 6380 "Redis")"
ok "Ports: API=$API_PORT, Postgres=$DB_PORT, Redis=$REDIS_PORT"

log "Deploying:"
echo "    Instance:  $INSTANCE_SLUG  (service: $SERVICE_NAME, user: $SERVICE_USER, compose project: ${COMPOSE_PROJECT_NAME:-<default>})"
echo "    API:       https://$API_DOMAIN  (proxied to 127.0.0.1:$API_PORT)"
echo "    Web app:   https://$WEB_DOMAIN  (static build served by Nginx)"
echo "    SSL:       $([ "$SKIP_SSL" -eq 1 ] && echo 'skipped (HTTP only)' || echo "yes, via $CERT_EMAIL")"
echo "    Yativo:    $YATIVO_MODE"
echo "    Repo:      $REPO_ROOT"
echo

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
#
# docker-compose.yml reads POSTGRES_PASSWORD/REDIS_PASSWORD/DB_PORT/REDIS_PORT from a
# root-level .env file (docker compose loads this automatically, including
# COMPOSE_PROJECT_NAME — which is what keeps this instance's containers/volumes separate
# from any other copy's) — generated once, here, before the containers are first
# created, since Postgres only applies POSTGRES_PASSWORD on an empty data directory.
# Never clobbered on rerun, same rule as apps/api/.env below.

if [ ! -f "$REPO_ROOT/.env" ]; then
  log "Generating root .env with strong Postgres/Redis passwords…"
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "REDIS_PASSWORD=$(openssl rand -hex 24)"
    echo "DB_PORT=${DB_PORT}"
    echo "REDIS_PORT=${REDIS_PORT}"
    [ -n "$COMPOSE_PROJECT_NAME" ] && echo "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"
  } > "$REPO_ROOT/.env"
  chmod 600 "$REPO_ROOT/.env"
  ok "Root .env created — docker-compose.yml picks it up automatically."
else
  ok "Root .env already exists — leaving it untouched (rerun-safe)."
  if ! grep -q '^DB_PORT=' "$REPO_ROOT/.env"; then
    log "Root .env predates DB_PORT/REDIS_PORT — appending them (existing secrets untouched)…"
    {
      echo "DB_PORT=${DB_PORT}"
      echo "REDIS_PORT=${REDIS_PORT}"
      [ -n "$COMPOSE_PROJECT_NAME" ] && echo "COMPOSE_PROJECT_NAME=${COMPOSE_PROJECT_NAME}"
    } >> "$REPO_ROOT/.env"
    ok "Appended."
  fi
fi

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
  CREDENTIAL_ENCRYPTION_KEY="$(gen_secret)" # encrypts provider credentials at rest — see apps/api/src/lib/credentialEncryption.ts
  DB_PASSWORD="$(grep '^POSTGRES_PASSWORD=' "$REPO_ROOT/.env" | cut -d= -f2-)" # generated above, shared with docker-compose.yml
  REDIS_PASSWORD="$(grep '^REDIS_PASSWORD=' "$REPO_ROOT/.env" | cut -d= -f2-)"

  cat > apps/api/.env <<EOF
NODE_ENV=production
PORT=$API_PORT

DATABASE_URL=postgresql://postgres:${DB_PASSWORD}@localhost:${DB_PORT}/whitelabel
REDIS_URL=redis://:${REDIS_PASSWORD}@localhost:${REDIS_PORT}

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

CREDENTIAL_ENCRYPTION_KEY=${CREDENTIAL_ENCRYPTION_KEY}
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
  if ! grep -q '^CREDENTIAL_ENCRYPTION_KEY=' apps/api/.env; then
    log "apps/api/.env predates CREDENTIAL_ENCRYPTION_KEY — appending a fresh one (existing secrets untouched)…"
    echo "CREDENTIAL_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> apps/api/.env
    ok "CREDENTIAL_ENCRYPTION_KEY added."
  fi
  # Sanity check: an existing apps/api/.env whose DATABASE_URL password doesn't match the
  # Postgres container's actual password (root .env) fails every query at runtime with an
  # opaque "Authentication failed" — this catches that mismatch instead of deploying broken.
  ENV_DB_PASSWORD="$(grep -oP '(?<=postgresql://postgres:)[^@]*' apps/api/.env || true)"
  COMPOSE_DB_PASSWORD="$(grep '^POSTGRES_PASSWORD=' "$REPO_ROOT/.env" 2>/dev/null | cut -d= -f2- || true)"
  if [ -n "$COMPOSE_DB_PASSWORD" ] && [ "$ENV_DB_PASSWORD" != "$COMPOSE_DB_PASSWORD" ]; then
    warn "apps/api/.env's DATABASE_URL password doesn't match the Postgres container's password (root .env)."
    warn "Every DB query will fail with 'Authentication failed' until these agree. Fix by either:"
    warn "  a) editing DATABASE_URL in apps/api/.env to use: $COMPOSE_DB_PASSWORD"
    warn "  b) or: docker compose exec postgres psql -U postgres -c \"ALTER USER postgres WITH PASSWORD '$ENV_DB_PASSWORD'\""
  fi
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
RESOURCE_LIMITS=""
[ -n "$CPU_QUOTA" ] && RESOURCE_LIMITS="${RESOURCE_LIMITS}CPUQuota=${CPU_QUOTA}
"
[ -n "$MEMORY_MAX" ] && RESOURCE_LIMITS="${RESOURCE_LIMITS}MemoryMax=${MEMORY_MAX}
"
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=White Label API ($INSTANCE_SLUG)
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
${RESOURCE_LIMITS}
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
echo "  Instance:   ${INSTANCE_SLUG}"
echo "  API:        http$( [ "$SKIP_SSL" -eq 0 ] && echo s )://${API_DOMAIN}  (127.0.0.1:${API_PORT})"
echo "  Web app:    http$( [ "$SKIP_SSL" -eq 0 ] && echo s )://${WEB_DOMAIN}"
echo "  Postgres:   127.0.0.1:${DB_PORT}  Redis: 127.0.0.1:${REDIS_PORT}  (compose project: ${COMPOSE_PROJECT_NAME:-<default>})"
echo "  Service:    systemctl {status|restart|stop} ${SERVICE_NAME}"
echo "  Logs:       journalctl -u ${SERVICE_NAME} -f"
echo
echo "  Other instances on this host: systemctl list-units 'whitelabel-api*'"
echo "  To add another independent copy: clone this repo elsewhere and rerun ./deploy.sh"
echo "  with a new pair of domains — see the header comment for details."
echo
warn "Before going further:"
echo "  1. Fill in YATIVO_API_KEY / YATIVO_API_SECRET in apps/api/.env, then: systemctl restart ${SERVICE_NAME}"
echo "  2. Enter the YATIVO_WEBHOOK_SECRET from $SECRETS_FILE into Yativo's webhook config"
echo "  3. Move the contents of $SECRETS_FILE to a password manager, then delete that file"
[ "$RUN_SEED" -eq 0 ] && echo "  4. Create your first admin/owner account (no seed data was loaded)"
echo
