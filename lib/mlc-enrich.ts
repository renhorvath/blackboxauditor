import type { AuditIssue, AuditRow } from "@/lib/types";
import type { MlcArtistHit } from "@/lib/mlc-artist-scan";
import type { SearchTrackHit } from "@/lib/types";

const MLC_UNMATCHED_ISSUE: AuditIssue = {
  type: "no_mlc_match",
  severity: "critical",
  message:
    "Az MLC (USA) összegyűjtött mechanikai jogdíjat ehhez a felvételhez, de nem találja a jogosultat — szerepel az MLC unmatched TSV listáján.",
  action:
    "Regisztrálj az MLC-nél (themlc.com), vagy kérd meg az ARTISJUS-t, hogy reciprocity agreement keretében igényelje a jogdíjat.",
};

export function buildRowsFromMlcHits(hits: MlcArtistHit[]): AuditRow[] {
  return hits.map((hit) => ({
    isrc: hit.isrc,
    title: hit.title || null,
    artist: hit.artist || null,
    iswc: null,
    mlcMatchStatus: "unmatched" as const,
    shareTotal: null,
    shareStatus: "missing" as const,
    songwriterCount: 0,
    publisherCount: 0,
    issues: [MLC_UNMATCHED_ISSUE],
    rawBatchData: null,
    artisjusMatched: false,
  }));
}

export function applyMlcArtistHits(
  rows: AuditRow[],
  mlcHits: MlcArtistHit[],
  spotifyByIsrc: Map<string, SearchTrackHit>,
): AuditRow[] {
  const hitByIsrc = new Map(mlcHits.map((h) => [h.isrc.toUpperCase(), h]));

  const updated = rows.map((row) => {
    const isrcKey = row.isrc.toUpperCase();
    const hit = hitByIsrc.get(isrcKey);
    const spotify = spotifyByIsrc.get(row.isrc) ?? spotifyByIsrc.get(isrcKey);
    const title = row.title || spotify?.title || hit?.title || null;
    const artist =
      row.artist || spotify?.artists.join(", ") || hit?.artist || null;

    if (!hit) {
      return { ...row, title, artist };
    }

    let issues = row.issues.filter((i) => i.type !== "not_in_mlc");
    if (!issues.some((i) => i.type === "no_mlc_match")) {
      issues = [...issues, MLC_UNMATCHED_ISSUE];
    }

    return {
      ...row,
      title,
      artist,
      mlcMatchStatus: "unmatched" as const,
      issues,
    };
  });

  const existing = new Set(updated.map((r) => r.isrc.toUpperCase()));
  const extra: AuditRow[] = [];

  for (const hit of mlcHits) {
    if (existing.has(hit.isrc.toUpperCase())) continue;
    existing.add(hit.isrc.toUpperCase());
    extra.push({
      isrc: hit.isrc,
      title: hit.title || null,
      artist: hit.artist || null,
      iswc: null,
      mlcMatchStatus: "unmatched",
      shareTotal: null,
      shareStatus: "missing",
      songwriterCount: 0,
      publisherCount: 0,
      issues: [MLC_UNMATCHED_ISSUE],
      rawBatchData: null,
      artisjusMatched: false,
    });
  }

  return extra.length > 0 ? [...updated, ...extra] : updated;
}
