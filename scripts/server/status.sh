#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG_DIR="${HOME}/Library/Logs/blackboxauditor"

echo "=== LaunchAgents ==="
for label in com.blackboxauditor.query-api com.blackboxauditor.cloudflared; do
  if launchctl list 2>/dev/null | grep -q "$label"; then
    echo "  OK  $label"
  else
    echo "  --  $label (not loaded)"
  fi
done

echo ""
echo "=== Query API (localhost:8787) ==="
if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer ${QUERY_API_KEY:-}" \
  http://127.0.0.1:8787/health 2>/dev/null || echo "000")

if [[ "$HTTP_CODE" == "200" ]]; then
  echo "  OK  health → 200"
elif [[ "$HTTP_CODE" == "401" ]]; then
  echo "  OK  listening (401 without key / wrong key in shell)"
else
  echo "  FAIL  health → ${HTTP_CODE}"
fi

echo ""
echo "=== Cloudflare tunnel URL ==="
TUNNEL_LOG="${LOG_DIR}/cloudflared.log"
if [[ -f "$TUNNEL_LOG" ]]; then
  URL=$(grep -o 'https://[^ ]*trycloudflare.com' "$TUNNEL_LOG" 2>/dev/null | tail -1 || true)
  if [[ -n "$URL" ]]; then
    echo "  $URL"
  else
    echo "  (no trycloudflare URL in log — maybe named tunnel?)"
  fi
else
  echo "  (no log yet: $TUNNEL_LOG)"
fi

echo ""
echo "Logs: $LOG_DIR/"
