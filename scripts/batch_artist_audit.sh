#!/usr/bin/env bash
# Batch artist audit via local API. Requires: npm run dev on port 3002
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/exports/batch_audit_results.json"
API="http://localhost:3002/api/health"
HEALTH_URL="http://localhost:3002"

wait_for_server() {
  for _ in $(seq 1 60); do
    if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  return 1
}

if ! wait_for_server; then
  echo "Starting dev server..."
  cd "$ROOT" && npm run dev &
  wait_for_server || { echo "Dev server failed to start"; exit 1; }
fi

API="http://localhost:3002/api/artist-audit"

ARTISTS=(
  "Carson Coma"
  "Demjén Ferenc"
  "Blahalouisiana"
  "Jazzbois"
  "Random Trip"
)

echo '{"runAt":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","results":[' > "$OUT"
first=1
for artist in "${ARTISTS[@]}"; do
  echo "=== $artist ==="
  payload=$(python3 -c "import json,sys; print(json.dumps({'artistName': sys.argv[1], 'scope': 'top15'}))" "$artist")
  resp=$(curl -sf -X POST -H "Content-Type: application/json" -d "$payload" "$API")
  summary=$(echo "$resp" | python3 -c "
import json,sys
d=json.load(sys.stdin)
rows=d.get('rows',[])
meta=d.get('meta',{})
problems=[r for r in rows if r.get('artisjusMatched') or r.get('mlcMatchStatus')=='unmatched' or r.get('mlcUnclaimed') or (r.get('cmoHits') or [])]
print(json.dumps({
  'artist': sys.argv[1],
  'totalRows': len(rows),
  'problemRows': len(problems),
  'mlcUnmatched': meta.get('mlcUnmatchedCount',0),
  'mlcUnclaimed': meta.get('mlcUnclaimedCount',0),
  'artisjus': meta.get('artisjusCount',0),
  'cmo': meta.get('cmoCounts',{}),
  'mlcScan': meta.get('mlcScanSource'),
  'mlcUnclaimedScan': meta.get('mlcUnclaimedScanSource'),
  'sampleProblems': [{
    'title': r.get('title'), 'isrc': r.get('isrc'),
    'unmatched': r.get('mlcMatchStatus')=='unmatched',
    'unclaimed': r.get('mlcUnclaimed'),
    'unclaimedPct': r.get('mlcUnclaimedPct'),
    'artisjus': r.get('artisjusMatched'),
    'cmo': [h.get('source') for h in (r.get('cmoHits') or [])]
  } for r in problems[:5]]
}, ensure_ascii=False))
" "$artist")
  echo "$summary" | python3 -m json.tool
  if [ "$first" -eq 1 ]; then first=0; else echo "," >> "$OUT"; fi
  echo "$summary" >> "$OUT"
done
echo "]}" >> "$OUT"
echo "Wrote $OUT"
