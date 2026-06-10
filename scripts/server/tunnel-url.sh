#!/usr/bin/env bash
LOG="${HOME}/Library/Logs/blackboxauditor/cloudflared.log"
if [[ ! -f "$LOG" ]]; then
  echo "No tunnel log yet. Is com.blackboxauditor.cloudflared running?"
  exit 1
fi
grep -o 'https://[^ ]*trycloudflare.com' "$LOG" | tail -1
