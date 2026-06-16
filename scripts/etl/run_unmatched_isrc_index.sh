#!/usr/bin/env bash
# One-shot ISRC index on mlc_unmatched (~845M rows). Run overnight on idle machine.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="${ROOT}/derived/mlc-hu/etl_mlc_unmatched_isrc_index.log"

mkdir -p "${ROOT}/derived/mlc-hu"
echo "=== $(date -u +%Y-%m-%dT%H:%M:%SZ) mlc_unmatched ISRC index build ===" | tee "$LOG"

cd "$ROOT"
export PYTHONUNBUFFERED=1
export DUCKDB_MEMORY_LIMIT="${DUCKDB_MEMORY_LIMIT:-12GB}"
export DUCKDB_THREADS="${DUCKDB_THREADS:-1}"
exec .venv/bin/python3 scripts/etl/build_mlc_isrc_index.py \
  --table unmatched \
  2>&1 | tee -a "$LOG"
