#!/usr/bin/env bash
# Wrapper for launchd — named tunnel (config.yml) or quick tunnel fallback.
set -euo pipefail

LOG_DIR="${HOME}/Library/Logs/blackboxauditor"
mkdir -p "$LOG_DIR"
LOG_FILE="${LOG_DIR}/cloudflared.log"

if [[ -n "${CLOUDFLARED_BIN:-}" ]]; then
  CLOUDFLARED="$CLOUDFLARED_BIN"
elif command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED="$(command -v cloudflared)"
else
  CLOUDFLARED="/usr/local/bin/cloudflared"
fi
CONFIG="${HOME}/.cloudflared/config.yml"

if [[ -f "$CONFIG" ]]; then
  exec "$CLOUDFLARED" tunnel run >> "$LOG_FILE" 2>&1
fi

# Quick tunnel — URL changes on each restart; see scripts/server/README.md for named tunnel.
exec "$CLOUDFLARED" tunnel --url http://127.0.0.1:8787 >> "$LOG_FILE" 2>&1
