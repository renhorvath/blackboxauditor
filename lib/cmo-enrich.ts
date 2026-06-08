import type { CmoArtistMatch, CmoRecord, CmoSourceId } from "@/lib/cmo-types";
import { CMO_ISRC_PREFIX, CMO_SOURCE_LABELS } from "@/lib/cmo-types";
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import type { AuditIssue, AuditRow } from "@/lib/types";

function cmoIssuesFromRecord(record: CmoRecord): AuditIssue[] {
  const label = CMO_SOURCE_LABELS[record.source];
  const roleNote =
    record.senaRole === "producenten"
      ? " (producenti jog)"
      : record.senaRole === "muzikanten"
        ? " (előadói jog)"
        : "";

  const messages: Record<CmoSourceId, string> = {
    "at-akm": `Az osztrák AKM Anfrageliste-jén szerepel azonosítatlan műként (Werknr. ${record.id}).`,
    "at-aume": `Az Austro-Mechana mechanikai jogi listáján szerepel (Werknr. ${record.id}).`,
    "nl-sena": `A holland SENA „ongeclaimd buitenland” listáján szerepel${roleNote} (Recording ID ${record.id.split(":")[0]}).`,
  };

  return [
    {
      type: "cmo_unmatched",
      severity: "critical",
      message: messages[record.source],
      action: `Ellenőrizd a ${label} regisztrációt / claim lehetőséget; egyeztess a helyi képviselőddel vagy a CMO-val.`,
    },
  ];
}

function normalizeTrackTitleForMatch(title: string): string {
  return normalizeArtisjusText(title)
    .replace(/\s*\(?\s*live\s*\)?/g, " ")
    .replace(/\s*-?\s*feat\.?.*$/g, "")
    .replace(/\s*\[.*?\]/g, " ")
    .replace(/\s*\(.*?(remix|mix|edit|version|verzió).*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findCmoRecordForTrackTitle(
  trackTitle: string | null | undefined,
  matches: CmoArtistMatch[],
): CmoArtistMatch | undefined {
  if (!trackTitle?.trim() || matches.length === 0) return undefined;
  const norm = normalizeTrackTitleForMatch(trackTitle);
  if (!norm) return undefined;

  for (const hit of matches) {
    const workNorm = normalizeTrackTitleForMatch(hit.record.title);
    if (!workNorm) continue;
    if (norm === workNorm) return hit;
    if (norm.includes(workNorm) && workNorm.length >= 8) return hit;
    if (workNorm.includes(norm) && norm.length >= 8) return hit;
  }
  return undefined;
}

function mergeCmoHit(row: AuditRow, hit: CmoArtistMatch): AuditRow {
  const existing = row.cmoHits ?? [];
  const key = `${hit.record.source}:${hit.record.id}`;
  if (existing.some((h) => `${h.source}:${h.recordId}` === key)) {
    return row;
  }

  const cmoHits = [
    ...existing,
    {
      source: hit.record.source,
      recordId: hit.record.id,
      title: hit.record.title,
      score: hit.score,
      senaRole: hit.record.senaRole,
    },
  ];

  const issues: AuditIssue[] = [
    ...row.issues.filter((i) => i.type !== "cmo_unmatched" || !i.message.includes(hit.record.source)),
    ...cmoIssuesFromRecord(hit.record),
  ];

  return { ...row, cmoHits, issues };
}

export function linkCmoMatchesToRows(
  rows: AuditRow[],
  matches: CmoArtistMatch[],
): AuditRow[] {
  if (matches.length === 0) return rows;

  return rows.map((row) => {
    let updated = row;
    const byTitle = findCmoRecordForTrackTitle(row.title, matches);
    if (byTitle) updated = mergeCmoHit(updated, byTitle);

    if (row.isrc && !row.isrc.startsWith("cmo:") && !row.isrc.startsWith("artisjus:")) {
      const isrcHit = matches.find(
        (m) => m.record.isrc?.toUpperCase() === row.isrc.toUpperCase(),
      );
      if (isrcHit) updated = mergeCmoHit(updated, isrcHit);
    }

    return updated;
  });
}

export function buildCmoOnlyRow(hit: CmoArtistMatch): AuditRow {
  const { record, score } = hit;
  return {
    isrc: `${CMO_ISRC_PREFIX}${record.source}:${record.id}`,
    title: record.title,
    artist: record.identification || null,
    iswc: null,
    mlcMatchStatus: "unknown",
    shareTotal: null,
    shareStatus: "missing",
    songwriterCount: 0,
    publisherCount: 0,
    issues: cmoIssuesFromRecord(record),
    rawBatchData: null,
    cmoHits: [
      {
        source: record.source,
        recordId: record.id,
        title: record.title,
        score,
        senaRole: record.senaRole,
      },
    ],
  };
}

export function appendCmoArtistRecords(
  rows: AuditRow[],
  matches: CmoArtistMatch[],
): AuditRow[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const hit of row.cmoHits ?? []) {
      seen.add(`${hit.source}:${hit.recordId}`);
    }
  }

  const extra: AuditRow[] = [];
  for (const hit of matches) {
    const key = `${hit.record.source}:${hit.record.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(buildCmoOnlyRow(hit));
  }

  return extra.length > 0 ? [...rows, ...extra] : rows;
}

export function countCmoMatchesBySource(
  matches: CmoArtistMatch[],
): Partial<Record<CmoSourceId, number>> {
  const counts: Partial<Record<CmoSourceId, number>> = {};
  const seen = new Set<string>();
  for (const hit of matches) {
    const key = `${hit.record.source}:${hit.record.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    counts[hit.record.source] = (counts[hit.record.source] ?? 0) + 1;
  }
  return counts;
}
