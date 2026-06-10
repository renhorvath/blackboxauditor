#!/usr/bin/env bash
# Install macOS LaunchAgents for query API + cloudflared (iMac as 24/7 data server).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/blackboxauditor"
AGENTS_DIR="${HOME}/Library/LaunchAgents"
RUN_QUERY_API="${ROOT}/scripts/server/run-query-api.sh"
RUN_CLOUDFLARED="${ROOT}/scripts/server/run-cloudflared.sh"

chmod +x "$RUN_QUERY_API" "$RUN_CLOUDFLARED"
mkdir -p "$LOG_DIR" "$AGENTS_DIR"

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "Missing $ROOT/.env.local — copy from .env.example and set QUERY_API_KEY first."
  exit 1
fi

render_plist() {
  local template="$1"
  local dest="$2"
  sed \
    -e "s|__PROJECT_ROOT__|${ROOT}|g" \
    -e "s|__LOG_DIR__|${LOG_DIR}|g" \
    -e "s|__RUN_QUERY_API__|${RUN_QUERY_API}|g" \
    -e "s|__RUN_CLOUDFLARED__|${RUN_CLOUDFLARED}|g" \
    "$template" > "$dest"
}

render_plist \
  "${ROOT}/scripts/server/com.blackboxauditor.query-api.plist.template" \
  "${AGENTS_DIR}/com.blackboxauditor.query-api.plist"

render_plist \
  "${ROOT}/scripts/server/com.blackboxauditor.cloudflared.plist.template" \
  "${AGENTS_DIR}/com.blackboxauditor.cloudflared.plist"

unload_if_loaded() {
  local label="$1"
  if launchctl list 2>/dev/null | grep -q "$label"; then
    launchctl unload "${AGENTS_DIR}/${label}.plist" 2>/dev/null || true
  fi
}

unload_if_loaded "com.blackboxauditor.query-api"
unload_if_loaded "com.blackboxauditor.cloudflared"

launchctl load "${AGENTS_DIR}/com.blackboxauditor.query-api.plist"
launchctl load "${AGENTS_DIR}/com.blackboxauditor.cloudflared.plist"

echo "Installed LaunchAgents:"
echo "  com.blackboxauditor.query-api"
echo "  com.blackboxauditor.cloudflared"
echo ""
echo "Logs: ${LOG_DIR}/"
echo ""
echo "Check status: npm run server:status"
echo ""
if [[ ! -f "${HOME}/.cloudflared/config.yml" ]]; then
  echo "NOTE: No ~/.cloudflared/config.yml — using quick tunnel (URL changes on restart)."
  echo "      After restart, run: npm run server:tunnel-url"
  echo "      For fixed URL see: scripts/server/README.md"
fi
