#!/usr/bin/env bash
# Pilot outreach — batch artist audit for pitch-packet targets.
# Requires: artisjus index built; for MLC use data machine (.venv + catalog.duckdb).
set -euo pipefail
cd "$(dirname "$0")/../.."

ARTISTS=(
  "Moldvai Márk"
  "Wettl Mátyás"
  "Mészáros János"
  "Melis László"
  "Barabás Béla"
  "Björkvall Oliver"
  "Czeichner Tamás"
  "Madarász Gábor"
  "Presser Gábor"
  "Balázs Ádám"
)

echo "Running artist audit for ${#ARTISTS[@]} pitch targets…"
npx tsx scripts/batch_artist_audit.mjs "${ARTISTS[@]}"

# Optional: publish reports (needs DATABASE_URL + PUBLISH_API_KEY)
# npx tsx scripts/batch_artist_audit.mjs --publish "${ARTISTS[@]}"

echo ""
echo "Results: exports/batch_audit_results.json"
echo "Pitch copy: docs/outreach/pitch-packet-hu-solo-top10.md"
