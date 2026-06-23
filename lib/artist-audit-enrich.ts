import {
  catalogEnrichProfile,
  countRealIsrcs,
  rowsForRecordingEnrich,
} from "@/lib/audit-core/enrich-profile";
import type { EnrichLegId } from "@/lib/audit-core/enrich-plan";
import { buildAuditSummary } from "@/lib/audit-engine";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { summarizeCatalogGaps } from "@/lib/audit-core/derive-gap-badges";
import { computeCatalogReady } from "@/lib/audit-core/catalog-lens";
import { baseWork } from "@/lib/audit-core/work-title-normalize";
import { applyCisacIswcEnrichment } from "@/lib/cisac-enrich";
import { discoverMlcWriterIdentity } from "@/lib/mlc-identity-hints";
import { applyMlcWriterSearchEnrichment } from "@/lib/mlc-writer-search-enrich";
import { loadCatalogSeed } from "@/lib/catalog-seed";
import {
  fetchBatchResults,
  fetchShareAudit,
  fetchUnmatchedAudit,
} from "@/lib/credits-fm";
import {
  fetchMlcWorksBySongCodes,
  mlcWorkToSongwriters,
  mlcWorksApiAvailable,
  resolveMlcRecordingsForRows,
  type MlcRecordingHit,
  type MlcWorkRecord,
} from "@/lib/mlc-works-api";
import {
  catalogEntryToWork,
  loadMlcWriterTitleCatalog,
  pickBestMlcCatalogEntry,
  pickMlcTitleMatches,
  type MlcCatalogEntry,
  type MlcTitleCatalog,
} from "@/lib/mlc-writer-catalog";
import {
  fetchSpotifyArtistIsrcMap,
  resolveSpotifyArtistIdByName,
  spotifyApiAvailable,
} from "@/lib/spotify";
import type { SearchTrackHit } from "@/lib/types";
import type {
  AuditRow,
  BatchRecordingData,
  BatchResult,
  CatalogRowEnrich,
  ShareAuditResult,
  UnmatchedAuditResult,
} from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

function normalizeIsrcKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "");
}

function countUniqueRealIsrcs(rows: AuditRow[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const isrc = row.isrc?.trim();
    if (!isrc || isSyntheticAuditIsrc(isrc)) continue;
    seen.add(normalizeIsrcKey(isrc));
  }
  return seen.size;
}

function collectEnrichableRows(
  rows: AuditRow[],
  max: number,
  spotifyByIsrc: Map<string, SearchTrackHit>,
): AuditRow[] {
  const seen = new Set<string>();
  const unique: AuditRow[] = [];
  for (const row of rows) {
    const isrc = row.isrc?.trim();
    if (!isrc || isSyntheticAuditIsrc(isrc)) continue;
    const key = normalizeIsrcKey(isrc);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }

  unique.sort((a, b) => {
    const aProblem = rowHasPayoutProblem(a) ? 0 : 1;
    const bProblem = rowHasPayoutProblem(b) ? 0 : 1;
    if (aProblem !== bProblem) return aProblem - bProblem;
    const aSpot = spotifyByIsrc.has(normalizeIsrcKey(a.isrc!)) ? 0 : 1;
    const bSpot = spotifyByIsrc.has(normalizeIsrcKey(b.isrc!)) ? 0 : 1;
    return aSpot - bSpot;
  });

  return unique.slice(0, max);
}

function recordingSearchInput(
  row: AuditRow,
  spotifyByIsrc: Map<string, SearchTrackHit>,
  artistName: string,
) {
  const key = normalizeIsrcKey(row.isrc ?? "");
  const spotify = spotifyByIsrc.get(key);
  const listTitle = row.title?.trim() || null;
  const listArtist = row.artist?.trim() || artistName;
  const spotifyTitle = spotify?.title?.trim() || null;
  const titleForParent = spotifyTitle || listTitle || "";
  return {
    isrc: row.isrc!,
    title: listTitle,
    artist: listArtist,
    searchTitle: spotifyTitle,
    searchArtist: spotify?.artists.join(", ").trim() || null,
    searchParentTitle: titleForParent ? baseWork(titleForParent) : null,
  };
}

function countSpotifyMetaMatches(
  rows: AuditRow[],
  spotifyByIsrc: Map<string, SearchTrackHit>,
): number {
  let n = 0;
  for (const row of rows) {
    const key = normalizeIsrcKey(row.isrc ?? "");
    if (key && spotifyByIsrc.has(key)) n += 1;
  }
  return n;
}

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

function syntheticBatchFromMlc(
  row: AuditRow,
  recording: MlcRecordingHit | undefined,
  work: MlcWorkRecord | undefined,
): BatchResult {
  const isrc = normalizeIsrcKey(row.isrc ?? "");
  const artists = (recording?.artist ?? row.artist ?? "")
    .split(",")
    .map((name) => ({ name: name.trim() }))
    .filter((a) => a.name);

  return {
    id: isrc,
    type: "isrc",
    found: true,
    data: {
      isrc,
      title: recording?.title ?? row.title ?? undefined,
      artists,
      iswc: work?.iswc ?? null,
      mlc_song_code: recording?.mlcSongCode ?? work?.mlcSongCode ?? null,
      songwriters: work ? mlcWorkToSongwriters(work) : [],
      publishers: work?.publishers ?? [],
      match_status: "matched",
    },
  };
}

function buildCatalogIssues(
  batch: BatchResult | undefined,
  share: ShareAuditResult | undefined,
  unmatched: UnmatchedAuditResult | undefined,
  work: MlcWorkRecord | undefined,
): AuditRow["issues"] {
  const issues: AuditRow["issues"] = [];
  if (!batch?.found && !work) return issues;

  const iswc = batch?.data?.iswc?.trim() || work?.iswc?.trim() || "";
  if (!iswc) {
    issues.push({
      type: "no_iswc",
      severity: "critical",
      message: "Nincs ISWC hozzárendelve ehhez a felvételhez (MLC / credits.fm).",
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

  const songwriterCount = batch?.data?.songwriters?.length ?? 0;
  if (songwriterCount === 0 && !work?.writers.length) {
    issues.push({
      type: "no_songwriter",
      severity: "warning",
      message: "Nincs szerző adat az MLC / credits.fm enrich válaszában.",
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
  recording: MlcRecordingHit | undefined,
): AuditRow {
  let effectiveBatch = batch;
  if (!batch?.found && (recording || work)) {
    effectiveBatch = syntheticBatchFromMlc(row, recording, work);
  } else if (batch?.found && recording?.mlcSongCode && !batch.data?.mlc_song_code?.trim()) {
    effectiveBatch = {
      ...batch,
      data: { ...batch.data!, mlc_song_code: recording.mlcSongCode },
    };
  }

  if (!effectiveBatch?.found) return row;

  const mergedBatch = mergeBatchData(effectiveBatch, work);
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

  const mlcMatched = Boolean(recording || work);
  const catalogEnrich: CatalogRowEnrich = {
    enrichedAt: new Date().toISOString(),
    creditsFmFound: batch?.found ?? false,
    creditsMlcStatus: unmatched?.match_status ?? (mlcMatched ? "matched" : undefined),
    mlcWorkSongCode: work?.mlcSongCode ?? mergedBatch.data?.mlc_song_code ?? null,
    mlcWorkFetched: Boolean(work),
    mlcRecordingFetched: Boolean(recording),
    mlcTitleMatch: Boolean(work && !recording && !batch?.data?.mlc_song_code?.trim()),
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
    catalogEnrichCreditsFound: number;
    catalogEnrichIswcFilled: number;
    catalogEnrichCreditsFm: boolean;
    catalogEnrichMlcRecordings: boolean;
    catalogEnrichMlcRecordingCount: number;
    catalogEnrichMlcWorks: boolean;
    catalogEnrichMlcWorkCount: number;
    catalogEnrichMlcWriterSearchFilled?: number;
    catalogEnrichMlcWriterSearchLookups?: number;
    catalogEnrichMlcWriterTitlesMatched?: number;
    catalogEnrichMlcWriterTitlesQueried?: number;
    catalogEnrichMlcWriterSkipReason?: "no_api" | "no_titles" | "no_writer" | "synthetic_catalog";
    catalogEnrichProfile?: "recording" | "composer" | "hybrid";
    catalogEnrichMlcApiAvailable?: boolean;
    catalogEnrichMlcDiscoveredIpi?: string | null;
    catalogEnrichMlcDiscoveredLegalName?: string | null;
    catalogEnrichIsrcTotal: number;
    catalogEnrichSpotifyMetaCount: number;
    catalogEnrichSpotifyCatalogCount: number;
    catalogEnrichSpotifyArtistResolved?: boolean;
    catalogEnrichCisacFilled: number;
    catalogEnrichCisacCatalogWorks: number;
    catalogEnrichCisacIpi: string | null;
    catalogEnrichCisacTitleLookups?: number;
    catalogEnrichLegalNameUsed?: boolean;
    catalogEnrichIswcNetFilled?: number;
    catalogEnrichIswcNetAttempted?: boolean;
    catalogEnrichMlcTitleMatchCount?: number;
    catalogEnrichMlcCatalogSource?: string;
    catalogEnrichBeatportSeedCount?: number;
    catalogEnrichCatalogSeedCount?: number;
    catalogReady: boolean;
    catalogGaps?: ReturnType<typeof summarizeCatalogGaps>;
  };
}

export async function enrichArtistAuditRows(
  rows: AuditRow[],
  options?: {
    artistName?: string;
    artistSlug?: string | null;
    maxIsrcs?: number;
    spotifyArtistId?: string;
    legalName?: string | null;
    writerIpi?: string | null;
    /** When set, only these legs run (staged enrich). Omit for legacy full pass. */
    legs?: EnrichLegId[];
  },
): Promise<CatalogEnrichResult> {
  const artistName = options?.artistName ?? "";
  const artistSlug = options?.artistSlug?.trim() || null;
  const enrichProfile = catalogEnrichProfile(rows);
  const composerOnly = enrichProfile === "composer";
  const staged = Boolean(options?.legs?.length);
  const want = (leg: EnrichLegId) => !staged || options!.legs!.includes(leg);
  const runIsrcLeg = want("isrc");
  const runCisacLeg = want("cisac");
  const runFullLegacy = !staged;

  let writerIpi = options?.writerIpi?.trim() || null;
  let legalName = options?.legalName?.trim() || null;
  let mlcDiscoveredIpi: string | null = null;
  let mlcDiscoveredLegalName: string | null = null;

  // Composer-only: IPI via identity wizard. Recording/hybrid: optional MLC discover when IPI missing.
  if (!writerIpi && !composerOnly && (runIsrcLeg || runFullLegacy)) {
    const discoverNames = [artistName, legalName ?? ""].filter(Boolean);
    if (discoverNames.length > 0) {
      const discovered = await discoverMlcWriterIdentity(discoverNames);
      mlcDiscoveredIpi = discovered.topIpi;
      mlcDiscoveredLegalName = discovered.topLegalName;
      if (!writerIpi && mlcDiscoveredIpi) writerIpi = mlcDiscoveredIpi;
      if (!legalName && mlcDiscoveredLegalName) legalName = mlcDiscoveredLegalName;
    }
  }

  const isrcTotal = countUniqueRealIsrcs(rows);
  const maxIsrcs =
    options?.maxIsrcs ??
    (Number.parseInt(process.env.CATALOG_ENRICH_MAX_ISRCS ?? "300", 10) || 300);

  let spotifyByIsrc = new Map<string, SearchTrackHit>();
  let spotifyCatalogCount = 0;
  let spotifyArtistId = options?.spotifyArtistId?.trim();
  if (!spotifyArtistId && artistName && spotifyApiAvailable()) {
    try {
      spotifyArtistId = (await resolveSpotifyArtistIdByName(artistName)) ?? undefined;
    } catch (err) {
      console.warn("[catalog-enrich] Spotify artist resolve failed:", err);
    }
  }
  const spotifyArtistResolved = Boolean(spotifyArtistId);
  if (spotifyArtistId && spotifyApiAvailable()) {
    try {
      const spotify = await fetchSpotifyArtistIsrcMap(spotifyArtistId);
      spotifyByIsrc = spotify.map;
      spotifyCatalogCount = spotify.map.size;
    } catch (err) {
      console.warn("[catalog-enrich] Spotify discography failed:", err);
    }
  }

  const catalogSeed = loadCatalogSeed(spotifyByIsrc, {
    slug: artistSlug,
    defaultArtist: artistName || undefined,
  });

  const enrichableRows = collectEnrichableRows(rows, maxIsrcs, spotifyByIsrc);
  const isrcs = enrichableRows.map((r) => r.isrc!.trim());
  const spotifyMetaCount = countSpotifyMetaMatches(enrichableRows, spotifyByIsrc);

  let batchResults: BatchResult[] = [];
  let shareResults: ShareAuditResult[] = [];
  let unmatchedResults: UnmatchedAuditResult[] = [];
  let creditsFmUsed = false;
  let mlcTitleCatalog: MlcTitleCatalog = {
    byNorm: new Map<string, MlcCatalogEntry[]>(),
    byCode: new Map<string, MlcCatalogEntry>(),
    source: "none",
    workCount: 0,
  };

  if (isrcs.length > 0 && (runIsrcLeg || runFullLegacy)) {
    creditsFmUsed = true;
    [batchResults, shareResults, unmatchedResults, mlcTitleCatalog] = await Promise.all([
      fetchBatchResults(isrcs),
      fetchShareAudit(isrcs),
      fetchUnmatchedAudit(isrcs),
      loadMlcWriterTitleCatalog(artistSlug),
    ]);
  } else if (runIsrcLeg || runFullLegacy) {
    mlcTitleCatalog = await loadMlcWriterTitleCatalog(artistSlug);
  }

  const batchByIsrc = new Map(batchResults.map((b) => [normalizeIsrcKey(b.id), b]));
  const shareByIsrc = new Map(shareResults.map((s) => [normalizeIsrcKey(s.isrc), s]));
  const unmatchedByIsrc = new Map(unmatchedResults.map((u) => [normalizeIsrcKey(u.isrc), u]));

  const skipRecordingSearch = new Set<string>();
  for (const batch of batchResults) {
    const code = batch.data?.mlc_song_code?.trim();
    if (code) skipRecordingSearch.add(normalizeIsrcKey(batch.id));
  }

  const titleMatchesByIsrc = new Map<string, MlcCatalogEntry[]>();
  for (const row of enrichableRows) {
    const key = normalizeIsrcKey(row.isrc ?? "");
    const spotify = spotifyByIsrc.get(key);
    const title = spotify?.title?.trim() || row.title?.trim() || "";
    if (!title) continue;
    const parent = baseWork(title);
    const matches = pickMlcTitleMatches(title, parent, mlcTitleCatalog.byNorm);
    if (matches.length > 0) titleMatchesByIsrc.set(key, matches);
  }

  const mlcApiAvailable = mlcWorksApiAvailable();
  const mlcRecordingsUsed =
    (runIsrcLeg || runFullLegacy) && mlcApiAvailable && enrichableRows.length > 0;
  const recordingsByIsrc = mlcRecordingsUsed
    ? await resolveMlcRecordingsForRows(
        enrichableRows.map((row) => recordingSearchInput(row, spotifyByIsrc, artistName)),
        skipRecordingSearch,
      )
    : new Map<string, MlcRecordingHit>();

  const songCodes: string[] = [];
  for (const batch of batchResults) {
    const code = batch.data?.mlc_song_code?.trim();
    if (code) songCodes.push(code);
  }
  for (const recording of recordingsByIsrc.values()) {
    if (recording.mlcSongCode) songCodes.push(recording.mlcSongCode);
  }
  for (const matches of titleMatchesByIsrc.values()) {
    for (const match of matches) songCodes.push(match.code);
  }

  let mlcWorks = new Map<string, MlcWorkRecord>();
  const mlcWorksUsed = mlcRecordingsUsed && songCodes.length > 0;
  if (mlcWorksUsed) {
    mlcWorks = await fetchMlcWorksBySongCodes(songCodes);
  }
  for (const entry of mlcTitleCatalog.byCode.values()) {
    const code = entry.code.toUpperCase();
    if (!mlcWorks.has(code)) {
      mlcWorks.set(code, catalogEntryToWork(entry));
    }
  }

  let enrichedRows = rows;
  if (runIsrcLeg || runFullLegacy) {
    enrichedRows = rows.map((row) => {
    const key = normalizeIsrcKey(row.isrc ?? "");
    if (!key || isSyntheticAuditIsrc(row.isrc)) return row;
    const batch = batchByIsrc.get(key);
    const share = shareByIsrc.get(key);
    const unmatched = unmatchedByIsrc.get(key);
    const recording = recordingsByIsrc.get(key);
    const titleMatches = titleMatchesByIsrc.get(key);
    const titleEntry = titleMatches ? pickBestMlcCatalogEntry(titleMatches) : undefined;
    const songCode =
      batch?.data?.mlc_song_code?.trim().toUpperCase() ??
      recording?.mlcSongCode?.trim().toUpperCase() ??
      titleEntry?.code?.trim().toUpperCase();
    const work = songCode ? mlcWorks.get(songCode) : undefined;

    if (!batch?.found && !recording && !work) {
      const spotify = spotifyByIsrc.get(key);
      if (!spotify) return row;
      return {
        ...row,
        title: row.title || spotify.title,
        artist: row.artist || spotify.artists.join(", "),
      };
    }
    const enriched = applyRowEnrichment(row, batch, share, unmatched, work, recording);
    const spotify = spotifyByIsrc.get(key);
    if (!spotify) {
      if (titleEntry && enriched.catalogEnrich) {
        return {
          ...enriched,
          catalogEnrich: { ...enriched.catalogEnrich, mlcTitleMatch: true },
        };
      }
      return enriched;
    }
    return {
      ...enriched,
      title: enriched.title || spotify.title,
      artist: enriched.artist || spotify.artists.join(", "),
    };
  });
  }

  let cisacFilled = 0;
  let cisacCatalogWorks = 0;
  let cisacIpiUsed: string | null = null;
  let cisacTitleLookups = 0;
  let iswcNetFilled = 0;
  let mlcWriterSearchFilled = 0;
  let mlcWriterSearchLookups = 0;
  let mlcWriterTitlesMatched = 0;
  let mlcWriterTitlesQueried = 0;
  let mlcWriterSearchSkipReason: "no_api" | "no_titles" | "no_writer" | "synthetic_catalog" | undefined;

  if (runFullLegacy) {
    if (composerOnly) {
      mlcWriterSearchSkipReason = "synthetic_catalog";
    } else {
      try {
        const mlcWriter = await applyMlcWriterSearchEnrichment(enrichedRows, {
          artistName,
          legalName,
          writerIpi,
          spotifyByIsrc,
          titleSourceRows:
            enrichProfile === "hybrid" ? rowsForRecordingEnrich(enrichedRows) : enrichedRows,
          maxLookups: enrichProfile === "hybrid" ? 15 : undefined,
        });
        enrichedRows = mlcWriter.rows;
        mlcWriterSearchFilled = mlcWriter.filled;
        mlcWriterSearchLookups = mlcWriter.lookups;
        mlcWriterTitlesMatched = mlcWriter.titlesMatched;
        mlcWriterTitlesQueried = mlcWriter.titlesQueried;
        mlcWriterSearchSkipReason = mlcWriter.skippedReason;
      } catch (err) {
        console.warn("[catalog-enrich] MLC writer search failed:", err);
      }
    }
  } else if (composerOnly) {
    mlcWriterSearchSkipReason = "synthetic_catalog";
  }

  if (runCisacLeg || runFullLegacy) {
    try {
      const cisac = await applyCisacIswcEnrichment(enrichedRows, {
        artistName,
        artistSlug,
        legalName,
        writerIpi,
        spotifyByIsrc,
        skipIswcNet: staged && !want("local"),
      });
      enrichedRows = cisac.rows;
      cisacFilled = cisac.cisacFilled;
      cisacCatalogWorks = cisac.cisacCatalogWorks;
      cisacIpiUsed = cisac.cisacIpiUsed;
      iswcNetFilled = cisac.iswcNetFilled;
      cisacTitleLookups = cisac.cisacTitleLookups;
    } catch (err) {
      console.warn("[catalog-enrich] CISAC enrich failed:", err);
    }
  }

  let creditsFound = 0;
  let iswcFilled = 0;
  for (const batch of batchResults) {
    if (batch.found) creditsFound += 1;
  }
  for (const row of enrichedRows) {
    if (row.catalogEnrich && row.iswc?.trim()) iswcFilled += 1;
  }

  const artistNameFinal = options?.artistName ?? "";
  const problemRows = enrichedRows.filter(rowHasPayoutProblem);
  const catalogGaps = artistNameFinal ? summarizeCatalogGaps(problemRows, artistNameFinal) : undefined;

  return {
    rows: enrichedRows,
    summary: buildAuditSummary(enrichedRows),
    meta: {
      catalogEnrichReady: !staged,
      catalogEnrichIsrcCount: isrcs.length,
      catalogEnrichIsrcTotal: isrcTotal,
      catalogEnrichSpotifyMetaCount: spotifyMetaCount,
      catalogEnrichSpotifyCatalogCount: spotifyCatalogCount,
      catalogEnrichSpotifyArtistResolved: spotifyArtistResolved,
      catalogEnrichCreditsFound: creditsFound,
      catalogEnrichIswcFilled: iswcFilled,
      catalogEnrichCisacFilled: cisacFilled,
      catalogEnrichCisacCatalogWorks: cisacCatalogWorks,
      catalogEnrichCisacIpi: cisacIpiUsed,
      catalogEnrichCisacTitleLookups: cisacTitleLookups,
      catalogEnrichLegalNameUsed: Boolean(legalName),
      catalogEnrichMlcDiscoveredIpi: mlcDiscoveredIpi,
      catalogEnrichMlcDiscoveredLegalName: mlcDiscoveredLegalName,
      catalogEnrichIswcNetFilled: iswcNetFilled,
      catalogEnrichIswcNetAttempted: Boolean(artistSlug),
      catalogEnrichMlcTitleMatchCount: titleMatchesByIsrc.size,
      catalogEnrichMlcCatalogSource: mlcTitleCatalog.source,
      catalogEnrichCatalogSeedCount: catalogSeed.added,
      catalogEnrichBeatportSeedCount: catalogSeed.added,
      catalogEnrichCreditsFm: creditsFmUsed,
      catalogEnrichMlcRecordings: mlcRecordingsUsed,
      catalogEnrichMlcRecordingCount: recordingsByIsrc.size,
      catalogEnrichMlcWorks: mlcWorksUsed,
      catalogEnrichMlcWorkCount: mlcWorks.size,
      catalogEnrichMlcWriterSearchFilled: mlcWriterSearchFilled,
      catalogEnrichMlcWriterSearchLookups: mlcWriterSearchLookups,
      catalogEnrichMlcWriterTitlesMatched: mlcWriterTitlesMatched,
      catalogEnrichMlcWriterTitlesQueried: mlcWriterTitlesQueried,
      catalogEnrichMlcWriterSkipReason: mlcWriterSearchSkipReason,
      catalogEnrichProfile: enrichProfile,
      catalogEnrichMlcApiAvailable: mlcApiAvailable,
      catalogReady: computeCatalogReady(
        enrichedRows,
        enrichedRows.filter((r) => r.artisjusMatched).length,
      ),
      catalogGaps,
    },
  };
}
