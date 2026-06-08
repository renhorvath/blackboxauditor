import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import type { EjiArtistHit, EjiHit, EjiTrackHit } from "@/lib/cmo-web/eji-types";
import { EJI_ISRC_PREFIX } from "@/lib/cmo-web/eji-types";
import type { AuditIssue, AuditRow } from "@/lib/types";

function normalizeTitle(title: string): string {
  return normalizeArtisjusText(title).replace(/\s+/g, " ").trim();
}

function ejiIssues(hit: EjiHit): AuditIssue[] {
  const detail =
    hit.kind === "track"
      ? `Hangfelvétel: „${hit.title}” (EJI #${hit.id})`
      : `Előadóművész: „${hit.name}” (ref ${hit.refId})`;

  return [
    {
      type: "eji_unidentified",
      severity: "critical",
      message: `Az EJI szomszédjogi jogosultkutatásában szerepel — ${detail}. Hiányzó adat miatt nem tudták kifizetni a jogdíjat.`,
      action:
        "Regisztráld magad az EJI-nál (eji.hu), vagy vedd fel velük a kapcsolatot a jogosultkutatás oldalon.",
    },
  ];
}

function hitKey(hit: EjiHit): string {
  return hit.kind === "track" ? `track:${hit.id}` : `artist:${hit.refId}`;
}

function toRowHit(hit: EjiHit) {
  if (hit.kind === "track") {
    return {
      kind: "track" as const,
      recordId: hit.id,
      title: hit.title,
      tipus: hit.tipus,
      mainArtist: hit.mainArtist,
      publisher: hit.publisher,
      publicationYear: hit.publicationYear,
      album: hit.album,
    };
  }
  return {
    kind: "artist" as const,
    recordId: hit.refId,
    name: hit.name,
    distributionPeriod: hit.distributionPeriod,
  };
}

function mergeEjiHit(row: AuditRow, hit: EjiHit): AuditRow {
  const key = hitKey(hit);
  const existing = row.ejiHits ?? [];
  if (existing.some((h) => `${h.kind}:${h.recordId}` === key)) {
    return row;
  }

  return {
    ...row,
    ejiHits: [...existing, toRowHit(hit)],
    issues: [
      ...row.issues.filter((i) => i.type !== "eji_unidentified" || !i.message.includes(hitKey(hit))),
      ...ejiIssues(hit),
    ],
  };
}

export function findEjiTrackForTitle(
  trackTitle: string | null | undefined,
  hits: EjiTrackHit[],
): EjiTrackHit | undefined {
  if (!trackTitle?.trim() || hits.length === 0) return undefined;
  const norm = normalizeTitle(trackTitle);
  if (!norm) return undefined;

  for (const hit of hits) {
    const workNorm = normalizeTitle(hit.title);
    if (!workNorm) continue;
    if (norm === workNorm) return hit;
    if (norm.includes(workNorm) && workNorm.length >= 6) return hit;
    if (workNorm.includes(norm) && norm.length >= 6) return hit;
  }
  return undefined;
}

export function linkEjiHitsToRows(rows: AuditRow[], hits: EjiHit[]): AuditRow[] {
  if (hits.length === 0) return rows;
  const trackHits = hits.filter((h): h is EjiTrackHit => h.kind === "track");

  return rows.map((row) => {
    const byTitle = findEjiTrackForTitle(row.title, trackHits);
    return byTitle ? mergeEjiHit(row, byTitle) : row;
  });
}

function buildEjiOnlyRow(hit: EjiHit): AuditRow {
  const title = hit.kind === "track" ? hit.title : hit.name;
  const artist = hit.kind === "track" ? hit.mainArtist : hit.name;

  return {
    isrc: `${EJI_ISRC_PREFIX}${hit.kind}:${hit.kind === "track" ? hit.id : hit.refId}`,
    title,
    artist,
    iswc: null,
    mlcMatchStatus: "unknown",
    shareTotal: null,
    shareStatus: "missing",
    songwriterCount: 0,
    publisherCount: 0,
    issues: ejiIssues(hit),
    rawBatchData: null,
    ejiHits: [toRowHit(hit)],
  };
}

export function appendEjiHits(rows: AuditRow[], hits: EjiHit[]): AuditRow[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const hit of row.ejiHits ?? []) {
      seen.add(`${hit.kind}:${hit.recordId}`);
    }
  }

  const extra: AuditRow[] = [];
  for (const hit of hits) {
    const key = hitKey(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    extra.push(buildEjiOnlyRow(hit));
  }

  return extra.length > 0 ? [...rows, ...extra] : rows;
}

export function flattenEjiHits(result: {
  trackHits: EjiTrackHit[];
  artistHits: EjiArtistHit[];
}): EjiHit[] {
  return [...result.trackHits, ...result.artistHits];
}

export function countEjiHits(hits: EjiHit[]): number {
  return new Set(hits.map(hitKey)).size;
}
