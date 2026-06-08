import { buildAuditSummary } from "@/lib/audit-engine";
import {
  appendArtisjusArtistWorks,
  linkArtisjusWorksToRows,
} from "@/lib/artisjus-enrich";
import { searchArtisjusByArtist } from "@/lib/artisjus-index";
import { buildRowsFromMlcHits } from "@/lib/mlc-enrich";
import { scanMlcArtist } from "@/lib/mlc-artist-scan";
import type { AuditRow, AuditSummary, ArtistAuditMeta, ArtistAuditScope } from "@/lib/types";

export interface ArtistAuditResult {
  rows: AuditRow[];
  summary: AuditSummary;
  meta: ArtistAuditMeta;
}

/**
 * Előadó-ellenőrzés: MLC unmatched TSV + ARTISJUS.
 * A credits.fm API-t itt nem használjuk — a helyi TSV pontosabb az MLC unmatched státuszhoz.
 */
export async function runArtistAudit(input: {
  artistName: string;
  scope: ArtistAuditScope;
}): Promise<ArtistAuditResult> {
  const forceRefresh = input.scope === "full";

  const mlcScan = await scanMlcArtist(input.artistName, { forceRefresh });
  const mlcHits = mlcScan?.hits ?? [];

  let rows: AuditRow[] = buildRowsFromMlcHits(mlcHits);

  const artisjusMatches = searchArtisjusByArtist(input.artistName, 150);
  const artistWorks = artisjusMatches.map((m) => m.work);
  const scores = new Map(artisjusMatches.map((m) => [m.work.mukod, m.score]));

  rows = linkArtisjusWorksToRows(rows, artistWorks, scores);
  rows = appendArtisjusArtistWorks(rows, artistWorks, scores);

  return {
    rows,
    summary: buildAuditSummary(rows),
    meta: {
      artistName: input.artistName,
      scope: input.scope,
      spotifyTrackCount: 0,
      isrcCount: mlcHits.length,
      mlcUnmatchedCount: mlcScan?.uniqueIsrcCount ?? 0,
      artisjusCount: artisjusMatches.length,
      mlcScanSource: mlcScan ? (mlcScan.fromCache ? "cache" : "live") : "none",
    },
  };
}
