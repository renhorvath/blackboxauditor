#!/usr/bin/env bash
# Wrapper for launchd — loads .env.local and starts the query API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

export PATH="$ROOT/node_modules/.bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

if [[ ! -x "$ROOT/node_modules/.bin/tsx" ]]; then
  echo "Installing tsx (required for launchd — npx hangs without TTY)..." >&2
  (cd "$ROOT" && npm install --no-audit --no-fund) >&2 || {
    echo "npm install failed — run manually in $ROOT" >&2
    exit 1
  }
fi

TSX="$ROOT/node_modules/.bin/tsx"
exec "$TSX" scripts/query-api/server.mts
