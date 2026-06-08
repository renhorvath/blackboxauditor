import { buildAuditSummary } from "@/lib/audit-engine";
import {
  appendArtisjusArtistWorks,
  linkArtisjusWorksToRows,
} from "@/lib/artisjus-enrich";
import { searchArtisjusByArtist } from "@/lib/artisjus-index";
import {
  appendCmoArtistRecords,
  countCmoMatchesBySource,
  linkCmoMatchesToRows,
} from "@/lib/cmo-enrich";
import { searchCmoByArtist } from "@/lib/cmo-index";
import {
  appendEjiHits,
  countEjiHits,
  flattenEjiHits,
  linkEjiHitsToRows,
} from "@/lib/cmo-web/eji-enrich";
import { searchEjiByArtist } from "@/lib/cmo-web/eji-search";
import { buildRowsFromMlcHits, mergeMlcUnclaimedHits } from "@/lib/mlc-enrich";
import { scanMlcArtist, scanMlcUnclaimedArtist } from "@/lib/mlc-artist-scan";
import type { AuditRow, AuditSummary, ArtistAuditMeta, ArtistAuditScope } from "@/lib/types";

export interface ArtistAuditResult {
  rows: AuditRow[];
  summary: AuditSummary;
  meta: ArtistAuditMeta;
}

/**
 * Előadó-ellenőrzés: ARTISJUS, EJI, MLC (USA), AKM, AUME, SENA azonosítatlan listák.
 */
export async function runArtistAudit(input: {
  artistName: string;
  scope: ArtistAuditScope;
}): Promise<ArtistAuditResult> {
  const forceRefresh = input.scope === "full";

  const [mlcScan, mlcUnclaimedScan] = await Promise.all([
    scanMlcArtist(input.artistName, { forceRefresh }),
    scanMlcUnclaimedArtist(input.artistName, { forceRefresh }),
  ]);

  let rows: AuditRow[] = buildRowsFromMlcHits(mlcScan?.hits ?? []);
  rows = mergeMlcUnclaimedHits(rows, mlcUnclaimedScan?.hits ?? []);

  const artisjusMatches = searchArtisjusByArtist(input.artistName, 150);
  const artistWorks = artisjusMatches.map((m) => m.work);
  const scores = new Map(artisjusMatches.map((m) => [m.work.mukod, m.score]));

  rows = linkArtisjusWorksToRows(rows, artistWorks, scores);
  rows = appendArtisjusArtistWorks(rows, artistWorks, scores);

  let cmoMatches: ReturnType<typeof searchCmoByArtist> = [];
  try {
    cmoMatches = searchCmoByArtist(input.artistName, { limit: 120 });
    rows = linkCmoMatchesToRows(rows, cmoMatches);
    rows = appendCmoArtistRecords(rows, cmoMatches);
  } catch {
    // CMO index optional until npm run cmo:build-index
  }

  let ejiCount = 0;
  let ejiFromCache = false;
  try {
    const ejiResult = await searchEjiByArtist(input.artistName, {
      forceRefresh: input.scope === "full",
    });
    const ejiHits = flattenEjiHits(ejiResult);
    ejiCount = countEjiHits(ejiHits);
    ejiFromCache = ejiResult.fromCache;
    rows = linkEjiHitsToRows(rows, ejiHits);
    rows = appendEjiHits(rows, ejiHits);
  } catch {
    // EJI web scrape optional — network / parse failures should not block audit
  }

  return {
    rows,
    summary: buildAuditSummary(rows),
    meta: {
      artistName: input.artistName,
      scope: input.scope,
      spotifyTrackCount: 0,
      isrcCount: (mlcScan?.uniqueIsrcCount ?? 0) + (mlcUnclaimedScan?.uniqueIsrcCount ?? 0),
      mlcUnmatchedCount: mlcScan?.uniqueIsrcCount ?? 0,
      mlcUnclaimedCount: mlcUnclaimedScan?.uniqueIsrcCount ?? 0,
      artisjusCount: artisjusMatches.length,
      cmoCounts: countCmoMatchesBySource(cmoMatches),
      ejiCount,
      ejiFromCache,
      mlcScanSource: mlcScan?.scanSource ?? "none",
      mlcUnclaimedScanSource: mlcUnclaimedScan?.scanSource ?? "none",
    },
  };
}
