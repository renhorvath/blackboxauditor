import type { AuditIssue, AuditRow } from "@/lib/types";
import type { MlcArtistHit, MlcUnclaimedHit } from "@/lib/mlc-artist-scan";
import type { SearchTrackHit } from "@/lib/types";

const MLC_UNMATCHED_ISSUE: AuditIssue = {
  type: "no_mlc_match",
  severity: "critical",
  message:
    "Az MLC (USA) összegyűjtött mechanikai jogdíjat ehhez a felvételhez, de nem találja a jogosultat — szerepel az MLC unmatched listáján (felvétel ↔ mű párosítás hiányzik).",
  action:
    "Regisztrálj az MLC-nél (themlc.com), vagy kérd meg az ARTISJUS-t, hogy reciprocity agreement keretében igényelje a jogdíjat.",
};

function mlcUnclaimedIssue(pct: number | null, workRecordId: string): AuditIssue {
  const pctLabel = pct !== null ? `${pct}%` : "ismeretlen %";
  return {
    type: "mlc_unclaimed_share",
    severity: "critical",
    message: `Az MLC-nél a mű mechanikai részesedése claim nélkül maradt (${pctLabel} unclaimed) — black box / unclaimed share (műkód: ${workRecordId || "n/a"}).`,
    action:
      "Regisztráld a művet és a share-eket az MLC-nél (Member Portal), vagy indíts claimet a The MLC felé.",
  };
}

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

export function mergeMlcUnclaimedHits(
  rows: AuditRow[],
  unclaimedHits: MlcUnclaimedHit[],
): AuditRow[] {
  if (unclaimedHits.length === 0) return rows;

  const byIsrc = new Map(unclaimedHits.map((h) => [h.isrc.toUpperCase(), h]));
  const updated = rows.map((row) => {
    const hit = byIsrc.get(row.isrc.toUpperCase());
    if (!hit) return row;

    const issue = mlcUnclaimedIssue(hit.unclaimedPct, hit.workRecordId);
    const hasIssue = row.issues.some((i) => i.type === "mlc_unclaimed_share");
    return {
      ...row,
      title: row.title || hit.title || null,
      artist: row.artist || hit.artist || null,
      mlcUnclaimed: true,
      mlcUnclaimedPct: hit.unclaimedPct,
      mlcWorkRecordId: hit.workRecordId || null,
      issues: hasIssue ? row.issues : [...row.issues, issue],
    };
  });

  const existing = new Set(updated.map((r) => r.isrc.toUpperCase()));
  const extra: AuditRow[] = [];

  for (const hit of unclaimedHits) {
    const key = hit.isrc.toUpperCase();
    if (existing.has(key)) continue;
    existing.add(key);
    extra.push({
      isrc: hit.isrc,
      title: hit.title || null,
      artist: hit.artist || null,
      iswc: null,
      mlcMatchStatus: "unknown",
      shareTotal: null,
      shareStatus: "missing",
      songwriterCount: 0,
      publisherCount: 0,
      issues: [mlcUnclaimedIssue(hit.unclaimedPct, hit.workRecordId)],
      rawBatchData: null,
      artisjusMatched: false,
      mlcUnclaimed: true,
      mlcUnclaimedPct: hit.unclaimedPct,
      mlcWorkRecordId: hit.workRecordId || null,
    });
  }

  return extra.length > 0 ? [...updated, ...extra] : updated;
}
