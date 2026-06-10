#!/usr/bin/env bash
# Resume interrupted unmatched token index build.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="${ROOT}/derived/mlc-hu/etl_artist_tokens_unmatched.log"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) unmatched token build resume ===" | tee -a "$LOG"

cd "$ROOT"
export PYTHONUNBUFFERED=1
exec .venv/bin/python3 scripts/etl/build_mlc_artist_tokens.py \
  --source unmatched \
  --resume \
  2>&1 | tee -a "$LOG"
