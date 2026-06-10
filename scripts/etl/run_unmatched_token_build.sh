#!/usr/bin/env bash
# Overnight unmatched token index — fresh start, 85 buckets, resume-safe.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="${ROOT}/derived/mlc-hu/etl_artist_tokens_unmatched.log"

mkdir -p "${ROOT}/derived/mlc-hu"

echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) unmatched token build start ===" | tee -a "$LOG"

cd "$ROOT"
export PYTHONUNBUFFERED=1
exec .venv/bin/python3 scripts/etl/build_mlc_artist_tokens.py \
  --source unmatched \
  --fresh \
  2>&1 | tee -a "$LOG"
