import { buildAuditSummary } from "@/lib/audit-engine";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { summarizeCatalogGaps } from "@/lib/audit-core/derive-gap-badges";
import { computeCatalogReady } from "@/lib/audit-core/catalog-lens";
import {
  fetchBatchResults,
  fetchShareAudit,
  fetchUnmatchedAudit,
} from "@/lib/credits-fm";
import {
  fetchMlcWorksBySongCodes,
  mlcWorkToSongwriters,
  mlcWorksApiAvailable,
  type MlcWorkRecord,
} from "@/lib/mlc-works-api";
import type {
  AuditRow,
  BatchRecordingData,
  BatchResult,
  CatalogRowEnrich,
  ShareAuditResult,
  UnmatchedAuditResult,
} from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

const A_SIDE_ISSUE_TYPES = new Set([
  "no_iswc",
  "no_mlc_match",
  "not_in_mlc",
  "incomplete_shares",
  "missing_shares",
  "over_allocated",
  "no_songwriter",
  "missing_ipi_mlc",
  "not_found",
]);

function normalizeIsrcKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "");
}

function collectEnrichableIsrcs(rows: AuditRow[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const isrc = row.isrc?.trim();
    if (!isrc || isSyntheticAuditIsrc(isrc)) continue;
    const key = normalizeIsrcKey(isrc);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(isrc);
    if (out.length >= max) break;
  }
  return out;
}

function shareStatusFromMlcWork(work: MlcWorkRecord): AuditRow["shareStatus"] {
  if (work.knownSharesPct >= 99.9) return "complete";
  if (work.knownSharesPct > 100) return "over_allocated";
  if (work.knownSharesPct > 0) return "incomplete";
  return "missing";
}

function mergeBatchData(
  batch: BatchResult,
  work: MlcWorkRecord | undefined,
): BatchResult {
  if (!batch.found || !batch.data) return batch;
  const data: BatchRecordingData = { ...batch.data };

  if (work?.iswc && !data.iswc?.trim()) {
    data.iswc = work.iswc;
  }

  if (work && (!data.songwriters || data.songwriters.length === 0)) {
    data.songwriters = mlcWorkToSongwriters(work);
  }

  if (work && !data.mlc_song_code) {
    data.mlc_song_code = work.mlcSongCode;
  }

  return { ...batch, data };
}

function buildCatalogIssues(
  batch: BatchResult | undefined,
  share: ShareAuditResult | undefined,
  unmatched: UnmatchedAuditResult | undefined,
  work: MlcWorkRecord | undefined,
): AuditRow["issues"] {
  const issues: AuditRow["issues"] = [];
  if (!batch?.found) return issues;

  const iswc = batch.data?.iswc?.trim() || work?.iswc?.trim() || "";
  if (!iswc) {
    issues.push({
      type: "no_iswc",
      severity: "critical",
      message: "Nincs ISWC hozzárendelve ehhez a felvételhez (credits.fm / MLC works).",
      action: "Regisztráld a művet a tagszervezetednél (pl. ARTISJUS) CISAC ISWC-vel.",
    });
  }

  if (unmatched?.match_status === "not_in_mlc") {
    issues.push({
      type: "not_in_mlc",
      severity: "warning",
      message: "Ez a felvétel nem szerepel az MLC adatbázisában (credits.fm).",
      action: "Ellenőrizd az MLC regisztrációt és a publisher bejelentést.",
    });
  }

  if (share?.share_status === "incomplete" || (work && work.knownSharesPct > 0 && work.knownSharesPct < 99.9)) {
    const pct = work?.knownSharesPct ?? share?.total_share;
    issues.push({
      type: "incomplete_shares",
      severity: "warning",
      message: `A mechanikai share összesen ${pct ?? "?"}% — hiányos allokáció.`,
      action: "Ellenőrizd az MLC műregisztráció publisher share mezőit.",
    });
  }

  if (batch.data?.songwriters?.length === 0 && !work?.writers.length) {
    issues.push({
      type: "no_songwriter",
      severity: "warning",
      message: "Nincs szerző adat a credits.fm / MLC works enrich válaszában.",
      action: "Nyisd meg a credits.fm ISRC oldalt vagy az MLC Member Portal műnézetét.",
    });
  }

  return issues;
}

function applyRowEnrichment(
  row: AuditRow,
  batch: BatchResult | undefined,
  share: ShareAuditResult | undefined,
  unmatched: UnmatchedAuditResult | undefined,
  work: MlcWorkRecord | undefined,
): AuditRow {
  if (!batch) return row;

  const mergedBatch = mergeBatchData(batch, work);
  const catalogIssues = buildCatalogIssues(mergedBatch, share, unmatched, work);

  const keptIssues = row.issues.filter((i) => !A_SIDE_ISSUE_TYPES.has(i.type));
  const issues = [...keptIssues, ...catalogIssues];

  const iswc = mergedBatch.data?.iswc?.trim() || work?.iswc?.trim() || row.iswc;
  const shareTotal = work?.knownSharesPct ?? share?.total_share ?? row.shareTotal;
  const shareStatus = work
    ? shareStatusFromMlcWork(work)
    : share?.share_status ?? row.shareStatus;

  const songwriters = mergedBatch.data?.songwriters ?? [];
  const publishers = mergedBatch.data?.publishers ?? [];

  const catalogEnrich: CatalogRowEnrich = {
    enrichedAt: new Date().toISOString(),
    creditsFmFound: mergedBatch.found,
    creditsMlcStatus: unmatched?.match_status,
    mlcWorkSongCode: work?.mlcSongCode ?? mergedBatch.data?.mlc_song_code ?? null,
    mlcWorkFetched: Boolean(work),
  };

  return {
    ...row,
    iswc: iswc || null,
    shareTotal,
    shareStatus,
    songwriterCount: songwriters.length || work?.writers.length || row.songwriterCount,
    publisherCount: publishers.length || work?.publishers.length || row.publisherCount,
    issues,
    rawBatchData: mergedBatch,
    catalogEnrich,
  };
}

export interface CatalogEnrichResult {
  rows: AuditRow[];
  summary: ReturnType<typeof buildAuditSummary>;
  meta: {
    catalogEnrichReady: boolean;
    catalogEnrichIsrcCount: number;
    catalogEnrichCreditsFm: boolean;
    catalogEnrichMlcWorks: boolean;
    catalogEnrichMlcWorkCount: number;
    catalogReady: boolean;
    catalogGaps?: ReturnType<typeof summarizeCatalogGaps>;
  };
}

export async function enrichArtistAuditRows(
  rows: AuditRow[],
  options?: { artistName?: string; maxIsrcs?: number },
): Promise<CatalogEnrichResult> {
  const maxIsrcs =
    options?.maxIsrcs ??
    (Number.parseInt(process.env.CATALOG_ENRICH_MAX_ISRCS ?? "120", 10) || 120);
  const isrcs = collectEnrichableIsrcs(rows, maxIsrcs);

  let batchResults: BatchResult[] = [];
  let shareResults: ShareAuditResult[] = [];
  let unmatchedResults: UnmatchedAuditResult[] = [];
  let creditsFmUsed = false;

  if (isrcs.length > 0) {
    creditsFmUsed = true;
    [batchResults, shareResults, unmatchedResults] = await Promise.all([
      fetchBatchResults(isrcs),
      fetchShareAudit(isrcs),
      fetchUnmatchedAudit(isrcs),
    ]);
  }

  const batchByIsrc = new Map(batchResults.map((b) => [normalizeIsrcKey(b.id), b]));
  const shareByIsrc = new Map(shareResults.map((s) => [normalizeIsrcKey(s.isrc), s]));
  const unmatchedByIsrc = new Map(unmatchedResults.map((u) => [normalizeIsrcKey(u.isrc), u]));

  const songCodes: string[] = [];
  for (const batch of batchResults) {
    const code = batch.data?.mlc_song_code?.trim();
    if (code) songCodes.push(code);
  }

  let mlcWorks = new Map<string, MlcWorkRecord>();
  const mlcWorksUsed = mlcWorksApiAvailable() && songCodes.length > 0;
  if (mlcWorksUsed) {
    mlcWorks = await fetchMlcWorksBySongCodes(songCodes);
  }

  const enrichedRows = rows.map((row) => {
    const key = normalizeIsrcKey(row.isrc ?? "");
    if (!key || isSyntheticAuditIsrc(row.isrc)) return row;
    const batch = batchByIsrc.get(key);
    const share = shareByIsrc.get(key);
    const unmatched = unmatchedByIsrc.get(key);
    const code = batch?.data?.mlc_song_code?.trim().toUpperCase();
    const work = code ? mlcWorks.get(code) : undefined;
    if (!batch && !work) return row;
    return applyRowEnrichment(row, batch, share, unmatched, work);
  });

  const artistName = options?.artistName ?? "";
  const problemRows = enrichedRows.filter(rowHasPayoutProblem);
  const catalogGaps = artistName ? summarizeCatalogGaps(problemRows, artistName) : undefined;

  return {
    rows: enrichedRows,
    summary: buildAuditSummary(enrichedRows),
    meta: {
      catalogEnrichReady: true,
      catalogEnrichIsrcCount: isrcs.length,
      catalogEnrichCreditsFm: creditsFmUsed,
      catalogEnrichMlcWorks: mlcWorksUsed,
      catalogEnrichMlcWorkCount: mlcWorks.size,
      catalogReady: computeCatalogReady(
        enrichedRows,
        enrichedRows.filter((r) => r.artisjusMatched).length,
      ),
      catalogGaps,
    },
  };
}
