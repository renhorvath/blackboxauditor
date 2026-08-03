#!/usr/bin/env bash
# Push INDEX_DATABASE_URL from .env.local to Vercel (all environments).
# Requires: npx vercel login
set -euo pipefail
cd "$(dirname "$0")/../.."

URL=$(python3 - <<'PY'
from pathlib import Path
for line in Path(".env.local").read_text().splitlines():
    if line.startswith("INDEX_DATABASE_URL="):
        print(line.split("=", 1)[1].strip().strip('"').strip("'"))
        break
else:
    raise SystemExit("INDEX_DATABASE_URL missing in .env.local")
PY
)

for ENV in production preview development; do
  echo "→ $ENV"
  npx vercel env rm INDEX_DATABASE_URL "$ENV" --yes </dev/null 2>/dev/null || true
  printf '%s' "$URL" | npx vercel env add INDEX_DATABASE_URL "$ENV" --yes </dev/null
done

echo "Done. Redeploy production for it to take effect:"
echo "  npx vercel --prod"
