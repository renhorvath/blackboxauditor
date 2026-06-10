#!/usr/bin/env bash
set -euo pipefail

AGENTS_DIR="${HOME}/Library/LaunchAgents"

for label in com.blackboxauditor.query-api com.blackboxauditor.cloudflared; do
  plist="${AGENTS_DIR}/${label}.plist"
  if [[ -f "$plist" ]]; then
    launchctl unload "$plist" 2>/dev/null || true
    rm -f "$plist"
    echo "Removed ${label}"
  fi
done

echo "LaunchAgents uninstalled. Manual processes (npm run query-api:start) are unaffected."
