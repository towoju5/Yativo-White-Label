#!/usr/bin/env bash
#
# Installs Postfix as a SEND-ONLY mail server for the API's transactional email, with DKIM signing.
#
#   sudo ./scripts/setup-postfix.sh yourdomain.com [options]
#
# Options:
#   --hostname=mail.yourdomain.com   This server's mail hostname (default: mail.<domain>). Needs an A
#                                    record pointing here AND reverse DNS (PTR) set to it at your VPS
#                                    provider — Gmail/Outlook reject or spam mail without matching rDNS.
#   --selector=mail                  DKIM selector (default: mail).
#   --api-env=apps/api/.env          Also point the API at Postfix (EMAIL_MODE=smtp, 127.0.0.1:25).
#                                    The file is backed up first. Restart the API afterwards.
#   --from=no-reply@yourdomain.com   Also set EMAIL_FROM_ADDRESS in --api-env (must be @<domain>).
#
# How it fits together:
#   - Postfix listens on 127.0.0.1:25 ONLY (inet_interfaces=loopback-only) — nothing new is exposed,
#     ufw rules are untouched, and it can't be used as an open relay.
#   - The API talks SMTP to 127.0.0.1:25 rather than piping into the `sendmail` binary: the API's
#     systemd unit runs with NoNewPrivileges + ProtectSystem=strict, which breaks Postfix's setgid
#     `postdrop` (the sendmail binary would fail silently-ish on every send).
#   - It does NOT receive mail for <domain> (mydestination=localhost) — mail to your own domain
#     still goes to whatever MX you already use, instead of being swallowed locally.
#   - Admin → Settings → Integrations email settings, if saved with an SMTP host, override .env.
#
# Safe to re-run: package installs are idempotent, the DKIM key is only generated once, and every
# config value is (re)set with postconf -e.
set -euo pipefail

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  !\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m  ✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root (sudo)."
command -v apt-get >/dev/null || die "This script supports Debian/Ubuntu (apt) only."

DOMAIN="${1:-}"
[ -n "$DOMAIN" ] && [[ "$DOMAIN" != --* ]] || die "Usage: sudo $0 yourdomain.com [--hostname=..] [--selector=..] [--api-env=..] [--from=..]"
shift
MAIL_HOSTNAME="mail.${DOMAIN}"
SELECTOR="mail"
API_ENV=""
FROM_ADDRESS=""
for arg in "$@"; do
  case "$arg" in
    --hostname=*) MAIL_HOSTNAME="${arg#*=}" ;;
    --selector=*) SELECTOR="${arg#*=}" ;;
    --api-env=*) API_ENV="${arg#*=}" ;;
    --from=*) FROM_ADDRESS="${arg#*=}" ;;
    *) die "Unknown option: $arg" ;;
  esac
done
if [ -n "$FROM_ADDRESS" ] && [[ "$FROM_ADDRESS" != *"@${DOMAIN}" ]]; then
  die "--from must be an address @${DOMAIN} — DKIM/SPF only cover that domain."
fi
if [ -n "$API_ENV" ] && [ ! -f "$API_ENV" ]; then die "--api-env file not found: $API_ENV"; fi

# ── 1. Packages ──────────────────────────────────────────────────────────────
log "Installing Postfix + OpenDKIM…"
echo "postfix postfix/main_mailer_type select Internet Site" | debconf-set-selections
echo "postfix postfix/mailname string ${DOMAIN}" | debconf-set-selections
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postfix opendkim opendkim-tools >/dev/null
echo "$DOMAIN" > /etc/mailname
ok "Installed."

# ── 2. DKIM key ──────────────────────────────────────────────────────────────
KEY_DIR="/etc/opendkim/keys/${DOMAIN}"
if [ ! -f "${KEY_DIR}/${SELECTOR}.private" ]; then
  log "Generating 2048-bit DKIM key (selector '${SELECTOR}')…"
  mkdir -p "$KEY_DIR"
  opendkim-genkey -b 2048 -d "$DOMAIN" -D "$KEY_DIR" -s "$SELECTOR"
  ok "Key generated."
else
  ok "DKIM key already exists — reusing it (DNS record stays valid)."
fi
chown -R opendkim:opendkim /etc/opendkim
chmod 700 "$KEY_DIR"
chmod 600 "${KEY_DIR}/${SELECTOR}.private"

log "Configuring OpenDKIM…"
cat > /etc/opendkim.conf <<EOF
# Managed by scripts/setup-postfix.sh — re-running the script overwrites this file.
Syslog                  yes
UMask                   007
UserID                  opendkim
PidFile                 /run/opendkim/opendkim.pid
Socket                  inet:8891@127.0.0.1
Mode                    s
Canonicalization        relaxed/simple
SignatureAlgorithm      rsa-sha256
OversignHeaders         From
Domain                  ${DOMAIN}
Selector                ${SELECTOR}
KeyFile                 ${KEY_DIR}/${SELECTOR}.private
EOF
# Debian/Ubuntu's unit takes its socket from /etc/default/opendkim (and regenerates its override
# from it) — keep both in agreement or it silently listens on a unix socket Postfix can't see.
if [ -f /etc/default/opendkim ]; then
  if grep -q '^SOCKET=' /etc/default/opendkim; then
    sed -i 's|^SOCKET=.*|SOCKET=inet:8891@127.0.0.1|' /etc/default/opendkim
  else
    echo 'SOCKET=inet:8891@127.0.0.1' >> /etc/default/opendkim
  fi
fi
[ -x /lib/opendkim/opendkim.service.generate ] && /lib/opendkim/opendkim.service.generate
systemctl daemon-reload
systemctl enable opendkim >/dev/null 2>&1
systemctl restart opendkim
ok "OpenDKIM running."

# ── 3. Postfix ───────────────────────────────────────────────────────────────
log "Configuring Postfix (send-only, loopback-only)…"
postconf -e \
  "myhostname = ${MAIL_HOSTNAME}" \
  "mydomain = ${DOMAIN}" \
  "myorigin = ${DOMAIN}" \
  "inet_interfaces = loopback-only" \
  "inet_protocols = ipv4" \
  "mydestination = localhost" \
  "mynetworks = 127.0.0.0/8" \
  "smtpd_relay_restrictions = permit_mynetworks, reject_unauth_destination" \
  "smtp_tls_security_level = may" \
  "smtp_tls_CApath = /etc/ssl/certs" \
  "smtp_tls_loglevel = 1" \
  "message_size_limit = 31457280" \
  "milter_protocol = 6" \
  "milter_default_action = accept" \
  "smtpd_milters = inet:127.0.0.1:8891" \
  "non_smtpd_milters = inet:127.0.0.1:8891"
# inet_protocols=ipv4: a VPS's IPv6 address rarely has reverse DNS, and Gmail rejects IPv6 senders
# without it — sending over IPv4 only avoids that whole class of bounce.
systemctl enable postfix >/dev/null 2>&1
systemctl restart postfix
postfix check
ok "Postfix running on 127.0.0.1:25."

if ss -ltn 2>/dev/null | grep -q '127.0.0.1:8891'; then
  ok "DKIM milter reachable on 127.0.0.1:8891."
else
  warn "OpenDKIM isn't listening on 127.0.0.1:8891 — mail will send UNSIGNED. Check: journalctl -u opendkim"
fi

# ── 4. Outbound port 25 ──────────────────────────────────────────────────────
log "Checking outbound port 25 (many VPS providers block it by default)…"
if timeout 8 bash -c 'exec 3<>/dev/tcp/gmail-smtp-in.l.google.com/25' 2>/dev/null; then
  ok "Outbound port 25 is open."
else
  warn "Outbound port 25 looks BLOCKED. Postfix will queue mail but never deliver it."
  warn "Ask your VPS provider to unblock SMTP (port 25), or configure Postfix to relay through a"
  warn "provider (relayhost) instead. Queue status: mailq"
fi

# ── 5. Point the API at Postfix ──────────────────────────────────────────────
set_env() {
  local key="$1" value="$2" file="$3"
  if grep -qE "^${key}=" "$file"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}
if [ -n "$API_ENV" ]; then
  log "Updating ${API_ENV}…"
  cp "$API_ENV" "${API_ENV}.bak.$(date +%Y%m%d%H%M%S)"
  set_env EMAIL_MODE smtp "$API_ENV"
  set_env SMTP_HOST 127.0.0.1 "$API_ENV"
  set_env SMTP_PORT 25 "$API_ENV"
  set_env SMTP_SECURE false "$API_ENV"
  set_env SMTP_USER "" "$API_ENV"
  set_env SMTP_PASSWORD "" "$API_ENV"
  [ -n "$FROM_ADDRESS" ] && set_env EMAIL_FROM_ADDRESS "$FROM_ADDRESS" "$API_ENV"
  ok "API email settings updated (backup saved alongside). Restart the API service to apply."
fi

# ── 6. DNS records ───────────────────────────────────────────────────────────
PUBLIC_IP="$(curl -4 -fsS -m 5 https://api.ipify.org 2>/dev/null || echo '<this-server-public-ipv4>')"
# opendkim-genkey writes the record as several quoted chunks split across lines — join them.
DKIM_VALUE="$(grep -o '"[^"]*"' "${KEY_DIR}/${SELECTOR}.txt" | tr -d '"\n')"

cat <<EOF

────────────────────────────────────────────────────────────────────────────────
 Add these DNS records (deliverability depends on ALL of them):

  A      ${MAIL_HOSTNAME}                 ${PUBLIC_IP}

  TXT    ${DOMAIN}
         v=spf1 ip4:${PUBLIC_IP} ~all
         (If ${DOMAIN} already has an SPF record, ADD "ip4:${PUBLIC_IP}" to it —
          a domain must have only one SPF record.)

  TXT    ${SELECTOR}._domainkey.${DOMAIN}
         ${DKIM_VALUE}

  TXT    _dmarc.${DOMAIN}
         v=DMARC1; p=none; rua=mailto:postmaster@${DOMAIN}

  PTR    ${PUBLIC_IP}  →  ${MAIL_HOSTNAME}
         (Reverse DNS — set this in your VPS provider's control panel, not your DNS host.)

 Then test (replace the recipient):
   printf 'Subject: Postfix test\n\nHello from %s\n' "\$(hostname)" | sendmail -f ${FROM_ADDRESS:-no-reply@${DOMAIN}} you@gmail.com
   journalctl -u postfix -n 30      # look for "status=sent (250 ..."
   mailq                            # anything stuck in the queue

 In Gmail, "Show original" on the test message should show SPF, DKIM and DMARC all PASS.
────────────────────────────────────────────────────────────────────────────────
EOF
