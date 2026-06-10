import { CMO_WEB_LABELS, type CmoWebHit } from "@/lib/cmo-web/web-types";
import type { AuditIssue, AuditRow } from "@/lib/types";

export const CMO_WEB_ISRC_PREFIX = "cmo-web:";

function hitKey(hit: CmoWebHit): string {
  return `${hit.source}:${hit.id}`;
}

function webIssues(hit: CmoWebHit): AuditIssue[] {
  const label = CMO_WEB_LABELS[hit.source];
  return [
    {
      type: "cmo_web_unidentified",
      severity: "critical",
      message: `${label}: „${hit.title}” — ${hit.identification || "azonosítatlan tétel"}.`,
      action: hit.claimUrl
        ? `Ellenőrizd a claim lehetőséget: ${hit.claimUrl}`
        : `Ellenőrizd a ${label} regisztrációt és claim folyamatot.`,
    },
  ];
}

function toRowHit(hit: CmoWebHit) {
  return {
    source: hit.source,
    recordId: hit.id,
    title: hit.title,
    identification: hit.identification,
    detail: hit.detail ?? null,
    claimUrl: hit.claimUrl ?? null,
  };
}

function mergeWebHit(row: AuditRow, hit: CmoWebHit): AuditRow {
  const key = hitKey(hit);
  const existing = row.cmoWebHits ?? [];
  if (existing.some((h) => `${h.source}:${h.recordId}` === key)) return row;

  return {
    ...row,
    cmoWebHits: [...existing, toRowHit(hit)],
    issues: [...row.issues, ...webIssues(hit)],
  };
}

export function linkCmoWebHitsToRows(rows: AuditRow[], hits: CmoWebHit[]): AuditRow[] {
  if (hits.length === 0) return rows;
  return rows.map((row) => {
    const artist = row.artist ?? "";
    const match = hits.find((h) =>
      h.identification.toLowerCase().includes(artist.toLowerCase().slice(0, 4)),
    );
    return match ? mergeWebHit(row, match) : row;
  });
}

function buildWebOnlyRow(hit: CmoWebHit): AuditRow {
  return {
    isrc: `${CMO_WEB_ISRC_PREFIX}${hit.source}:${hit.id}`,
    title: hit.title,
    artist: hit.identification,
    iswc: null,
    mlcMatchStatus: "unknown",
    shareTotal: null,
    shareStatus: "missing",
    songwriterCount: 0,
    publisherCount: 0,
    issues: webIssues(hit),
    rawBatchData: null,
    cmoWebHits: [toRowHit(hit)],
  };
}

export function appendCmoWebHits(rows: AuditRow[], hits: CmoWebHit[]): AuditRow[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const hit of row.cmoWebHits ?? []) {
      seen.add(`${hit.source}:${hit.recordId}`);
    }
  }

  const extra: AuditRow[] = [];
  for (const hit of hits) {
    const key = hitKey(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(buildWebOnlyRow(hit));
  }

  return extra.length > 0 ? [...rows, ...extra] : rows;
}

export function flattenCmoWebResults(
  results: { hits: CmoWebHit[] }[],
): CmoWebHit[] {
  const out: CmoWebHit[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    for (const hit of result.hits) {
      const key = hitKey(hit);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(hit);
    }
  }
  return out;
}

export function countCmoWebHits(hits: CmoWebHit[]): number {
  return new Set(hits.map(hitKey)).size;
}

export function countCmoWebHitsBySource(
  hits: CmoWebHit[],
): Partial<Record<CmoWebHit["source"], number>> {
  const counts: Partial<Record<CmoWebHit["source"], number>> = {};
  for (const hit of hits) {
    counts[hit.source] = (counts[hit.source] ?? 0) + 1;
  }
  return counts;
}
