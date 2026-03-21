#!/bin/bash

# ============================================
# Auto IP Update Script — youtube-shorts-republisher
# ============================================
# Detects current public IP, updates DuckDNS,
# updates .env NEXTAUTH_URL, and restarts app.
#
# Usage:
#   ./update-ip.sh              # full run
#   ./update-ip.sh --no-restart # update .env + DuckDNS only
#
# Cron (auto-run every 10 min):
#   */10 * * * * /home/ubuntu/abnana/youtube-shorts-republisher/update-ip.sh >> /home/ubuntu/abnana/youtube-shorts-republisher/ip-update.log 2>&1
# ============================================

set -euo pipefail

# ---------- Config ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
PORT=80
NO_RESTART=false

DUCKDNS_DOMAIN="gravixog"
DUCKDNS_TOKEN="47bdeaa5-4d0b-4a07-b8ed-443a3ac54264"
DUCKDNS_URL="https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip="

PUBLIC_DOMAIN="https://${DUCKDNS_DOMAIN}.duckdns.org"

if [[ "${1:-}" == "--no-restart" ]]; then
  NO_RESTART=true
fi

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { echo "[$(timestamp)] $1"; }

# ---------- Get current public IP ----------
log "🔍 Detecting current public IP..."

NEW_IP=""
for service in \
  "https://api.ipify.org" \
  "https://ifconfig.me/ip" \
  "https://icanhazip.com" \
  "https://ipecho.net/plain"; do
  NEW_IP=$(curl -s --max-time 5 "$service" 2>/dev/null | tr -d '[:space:]') || true
  if [[ "$NEW_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    log "✅ Got IP from $service: $NEW_IP"
    break
  fi
done

if [[ -z "$NEW_IP" ]]; then
  log "❌ Could not detect public IP. Aborting."
  exit 1
fi

NEW_URL="${PUBLIC_DOMAIN}"

# ---------- Read current .env ----------
if [[ ! -f "$ENV_FILE" ]]; then
  log "❌ .env file not found at $ENV_FILE"
  exit 1
fi

CURRENT_URL=$(grep -E "^NEXTAUTH_URL=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '[:space:]') || true

# ---------- Update DuckDNS (always sync IP) ----------
log "🦆 Updating DuckDNS → ${DUCKDNS_DOMAIN}.duckdns.org = $NEW_IP ..."
DUCK_RESPONSE=$(curl -s --max-time 10 "${DUCKDNS_URL}${NEW_IP}" 2>/dev/null || true)

if [[ "$DUCK_RESPONSE" == "OK" ]]; then
  log "✅ DuckDNS updated successfully!"
elif [[ "$DUCK_RESPONSE" == "KO" ]]; then
  log "❌ DuckDNS update failed (KO). Check token/domain."
else
  log "⚠️  DuckDNS response: $DUCK_RESPONSE"
fi

# ---------- Check if NEXTAUTH_URL needs update ----------
if [[ "$CURRENT_URL" == "$NEW_URL" ]]; then
  log "✅ NEXTAUTH_URL already set to domain. Nothing more to do."
  exit 0
fi

log "🔄 Updating NEXTAUTH_URL..."
log "   Old: $CURRENT_URL"
log "   New: $NEW_URL"

# Backup .env
cp "$ENV_FILE" "${ENV_FILE}.bak"
log "📦 Backed up .env → .env.bak"

# Update NEXTAUTH_URL
sed -i "s|^NEXTAUTH_URL=.*|NEXTAUTH_URL=${NEW_URL}|" "$ENV_FILE"
log "✏️  Updated NEXTAUTH_URL in .env"

# Verify
UPDATED_URL=$(grep -E "^NEXTAUTH_URL=" "$ENV_FILE" | cut -d'=' -f2-)
if [[ "$UPDATED_URL" != "$NEW_URL" ]]; then
  log "❌ Failed to verify .env update. Restoring backup."
  cp "${ENV_FILE}.bak" "$ENV_FILE"
  exit 1
fi

log "✅ .env updated successfully!"

# ---------- Restart app ----------
if [[ "$NO_RESTART" == true ]]; then
  log "⏭️  Skipping restart (--no-restart flag set)"
  log "   ⚠️  Manually restart app for changes to take effect!"
  exit 0
fi

log "🔁 Restarting Next.js app..."

PIDS=$(lsof -ti :3000 2>/dev/null || true)
if [[ -n "$PIDS" ]]; then
  echo "$PIDS" | xargs kill -9 2>/dev/null || true
  log "🛑 Killed old process(es) on port 3000: $PIDS"
  sleep 2
fi

cd "$SCRIPT_DIR"
nohup bash -c '~/.bun/bin/bun run dev > dev.log 2>&1' &
NEWPID=$!
log "🚀 Started app (PID: $NEWPID)"

sleep 5
if lsof -ti :3000 > /dev/null 2>&1; then
  log "✅ App is running on port 3000!"
else
  log "⚠️  App may not have started yet. Check dev.log."
fi

log "============================================"
log "✅ Update Complete!"
log "   IP        : $NEW_IP"
log "   Domain    : ${DUCKDNS_DOMAIN}.duckdns.org"
log "   Public URL: $PUBLIC_DOMAIN"
log "   Time      : $(timestamp)"
log "============================================"
