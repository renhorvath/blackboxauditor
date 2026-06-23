import { countRealIsrcs } from "@/lib/audit-core/enrich-profile";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { summarizeCatalogGaps } from "@/lib/audit-core/derive-gap-badges";
import { computeCatalogReady } from "@/lib/audit-core/catalog-lens";
import {
  fetchLocalArtistSources,
  fetchLocalFastSources,
  fetchLocalMlcSources,
} from "@/lib/artist-audit-sources";
import { artisjusIndexAvailable } from "@/lib/artisjus-index";
import {
  appendArtisjusArtistWorks,
  linkArtisjusWorksToRows,
} from "@/lib/artisjus-enrich";
import {
  appendCmoArtistRecords,
  countCmoMatchesBySource,
  linkCmoMatchesToRows,
} from "@/lib/cmo-enrich";
import { cmoIndexAvailable } from "@/lib/cmo-index";
import {
  appendEjiHits,
  countEjiHits,
  flattenEjiHits,
  linkEjiHitsToRows,
} from "@/lib/cmo-web/eji-enrich";
import { searchEjiByArtist } from "@/lib/cmo-web/eji-search";
import { searchCmoWebByArtist } from "@/lib/cmo-web/search";
import {
  appendCmoWebHits,
  countCmoWebHits,
  countCmoWebHitsBySource,
  flattenCmoWebResults,
  linkCmoWebHitsToRows,
} from "@/lib/cmo-web/web-enrich";
import { buildRowsFromMlcHits, mergeMlcUnclaimedHits } from "@/lib/mlc-enrich";
import {
  catalogAvailable,
  type MlcArtistScanResult,
  type MlcUnclaimedScanResult,
} from "@/lib/mlc-artist-scan";
import {
  artistAuditSkipMlcUnclaimed,
  artistAuditSkipMlcUnmatched,
  queryApiBaseUrl,
  shouldUseQueryApi,
} from "@/lib/query-api-config";
import { isServerlessRuntime } from "@/lib/runtime-env";
import {
  fetchArtistSourcesFromQueryApi,
  fetchCmoWebFromQueryApi,
  QueryApiError,
} from "@/lib/query-api-client";
import type { ArtistAuditSourcesPayload } from "@/lib/query-api-types";
import type { AuditRow, AuditSummary, ArtistAuditMeta, ArtistAuditScope } from "@/lib/types";

export type ArtistAuditMlcMode = "wait" | "skip" | "only";

export interface ArtistAuditResult {
  rows: AuditRow[];
  summary: AuditSummary;
  meta: ArtistAuditMeta;
}

function asRemoteScan<T extends { scanSource: string }>(
  result: T | null,
): (T & { scanSource: "remote" }) | null {
  if (!result) return null;
  return { ...result, scanSource: "remote" };
}

function emptyPayload(artistName: string): ArtistAuditSourcesPayload {
  return {
    artistName,
    mlcUnmatched: null,
    mlcUnclaimed: null,
    artisjusMatches: [],
    cmoMatches: [],
    capabilities: { catalog: false, artisjusIndex: false, cmoIndex: false },
  };
}

async function loadArtistSources(
  artistName: string,
  options: {
    forceRefresh: boolean;
    mlcMode: ArtistAuditMlcMode;
  },
): Promise<{ payload: ArtistAuditSourcesPayload; viaQueryApi: boolean }> {
  const { forceRefresh, mlcMode } = options;
  const skipMlc = mlcMode === "skip";
  const mlcOnly = mlcMode === "only";

  if (isServerlessRuntime() && !queryApiBaseUrl()) {
    return { payload: emptyPayload(artistName), viaQueryApi: false };
  }

  if (shouldUseQueryApi()) {
    try {
      const payload = await fetchArtistSourcesFromQueryApi(artistName, {
        forceRefresh,
        skipMlcUnmatched: skipMlc || artistAuditSkipMlcUnmatched(),
        skipMlcUnclaimed: skipMlc || artistAuditSkipMlcUnclaimed(),
      });
      if (mlcOnly) {
        const fast = await fetchArtistSourcesFromQueryApi(artistName, {
          forceRefresh: false,
          skipMlcUnmatched: true,
          skipMlcUnclaimed: true,
        }).catch(() => emptyPayload(artistName));
        return {
          payload: {
            ...fast,
            mlcUnmatched: payload.mlcUnmatched,
            mlcUnclaimed: payload.mlcUnclaimed,
            capabilities: payload.capabilities,
          },
          viaQueryApi: true,
        };
      }
      return { payload, viaQueryApi: true };
    } catch (err) {
      if (err instanceof QueryApiError) {
        console.error("[artist-audit] Query API failed:", err.message);
      }
      throw err;
    }
  }

  if (mlcOnly) {
    const [fast, mlc] = await Promise.all([
      fetchLocalFastSources(artistName),
      fetchLocalMlcSources(artistName, { forceRefresh }),
    ]);
    return { payload: { ...fast, ...mlc }, viaQueryApi: false };
  }

  if (skipMlc) {
    const fast = await fetchLocalFastSources(artistName);
    return {
      payload: {
        ...fast,
        mlcUnmatched: null,
        mlcUnclaimed: null,
      },
      viaQueryApi: false,
    };
  }

  const payload = await fetchLocalArtistSources(artistName, { forceRefresh });
  return { payload, viaQueryApi: false };
}

async function loadCmoWebResults(
  artistName: string,
  forceRefresh: boolean,
): Promise<Awaited<ReturnType<typeof searchCmoWebByArtist>>> {
  if (shouldUseQueryApi()) {
    return fetchCmoWebFromQueryApi(artistName, { forceRefresh }).catch(() => []);
  }
  return searchCmoWebByArtist(artistName, { forceRefresh }).catch(() => []);
}

function assembleArtistAuditResult(input: {
  artistName: string;
  scope: ArtistAuditScope;
  payload: ArtistAuditSourcesPayload;
  viaQueryApi: boolean;
  ejiResult: Awaited<ReturnType<typeof searchEjiByArtist>> | null;
  cmoWebResults: Awaited<ReturnType<typeof searchCmoWebByArtist>>;
  mlcUnmatchedSkipped?: boolean;
  mlcUnclaimedSkipped?: boolean;
  mlcPending?: boolean;
}): ArtistAuditResult {
  const {
    artistName,
    scope,
    payload,
    viaQueryApi,
    ejiResult,
    cmoWebResults,
    mlcPending,
  } = input;

  const dataBackend = viaQueryApi
    ? "query-api"
    : isServerlessRuntime() && !queryApiBaseUrl()
      ? "unavailable"
      : "local";

  const mlcScan: MlcArtistScanResult | null = viaQueryApi
    ? asRemoteScan(payload.mlcUnmatched)
    : payload.mlcUnmatched;
  const mlcUnclaimedScan: MlcUnclaimedScanResult | null = viaQueryApi
    ? asRemoteScan(payload.mlcUnclaimed)
    : payload.mlcUnclaimed;

  let rows: AuditRow[] = buildRowsFromMlcHits(mlcScan?.hits ?? []);
  rows = mergeMlcUnclaimedHits(rows, mlcUnclaimedScan?.hits ?? []);

  const artisjusMatches = payload.artisjusMatches;
  const artistWorks = artisjusMatches.map((m) => m.work);
  const scores = new Map(artisjusMatches.map((m) => [m.work.mukod, m.score]));

  rows = linkArtisjusWorksToRows(rows, artistWorks, scores);
  rows = appendArtisjusArtistWorks(rows, artistWorks, scores);

  const cmoMatches = payload.cmoMatches;
  rows = linkCmoMatchesToRows(rows, cmoMatches);
  rows = appendCmoArtistRecords(rows, cmoMatches);

  let ejiCount = 0;
  let ejiFromCache = false;
  if (ejiResult) {
    const ejiHits = flattenEjiHits(ejiResult);
    ejiCount = countEjiHits(ejiHits);
    ejiFromCache = ejiResult.fromCache;
    rows = linkEjiHitsToRows(rows, ejiHits);
    rows = appendEjiHits(rows, ejiHits);
  }

  const cmoWebHits = flattenCmoWebResults(cmoWebResults ?? []);
  const cmoWebFromCache =
    (cmoWebResults ?? []).length > 0 && (cmoWebResults ?? []).every((r) => r.fromCache);
  if (cmoWebHits.length > 0) {
    rows = linkCmoWebHitsToRows(rows, cmoWebHits);
    rows = appendCmoWebHits(rows, cmoWebHits);
  }

  const sourceCapabilities: ArtistAuditMeta["sourceCapabilities"] =
    dataBackend === "unavailable"
      ? { catalog: false, artisjusIndex: false, cmoIndex: false }
      : viaQueryApi
        ? payload.capabilities
        : {
            catalog: catalogAvailable(),
            artisjusIndex: artisjusIndexAvailable(),
            cmoIndex: cmoIndexAvailable(),
          };

  const mlcUnmatchedSkipped =
    input.mlcUnmatchedSkipped ?? artistAuditSkipMlcUnmatched();
  const mlcUnclaimedSkipped =
    input.mlcUnclaimedSkipped ?? artistAuditSkipMlcUnclaimed();
  const problemRows = rows.filter(rowHasPayoutProblem);
  const catalogGaps = summarizeCatalogGaps(problemRows, artistName);
  const catalogReady = computeCatalogReady(rows, artisjusMatches.length);

  return {
    rows,
    summary: buildAuditSummary(rows),
    meta: {
      artistName,
      scope,
      spotifyTrackCount: 0,
      isrcCount: (mlcScan?.uniqueIsrcCount ?? 0) + (mlcUnclaimedScan?.uniqueIsrcCount ?? 0),
      mlcUnmatchedCount: mlcScan?.uniqueIsrcCount ?? 0,
      mlcUnclaimedCount: mlcUnclaimedScan?.uniqueIsrcCount ?? 0,
      artisjusCount: artisjusMatches.length,
      cmoCounts: countCmoMatchesBySource(cmoMatches),
      cmoWebCounts: countCmoWebHitsBySource(cmoWebHits),
      ejiCount,
      ejiFromCache,
      cmoWebFromCache,
      queryApiUsed: viaQueryApi,
      dataBackend,
      mlcScanSource: mlcScan?.scanSource ?? "none",
      mlcUnclaimedScanSource: mlcUnclaimedScan?.scanSource ?? "none",
      mlcUnmatchedSkipped,
      mlcUnclaimedSkipped,
      mlcPending: mlcPending === true,
      catalogGaps,
      catalogReady,
      sourceCapabilities,
    },
  };
}

/** True when a follow-up MLC-only request is worthwhile. */
export function artistAuditNeedsMlcFollowUp(
  meta: Pick<ArtistAuditMeta, "mlcUnmatchedSkipped" | "mlcUnclaimedSkipped" | "sourceCapabilities">,
  options?: { realIsrcCount?: number },
): boolean {
  if ((options?.realIsrcCount ?? 1) === 0) return false;
  if (meta.mlcUnmatchedSkipped && meta.mlcUnclaimedSkipped) return false;
  return meta.sourceCapabilities?.catalog === true;
}

/**
 * Előadó-ellenőrzés: ARTISJUS, EJI, MLC (USA), AKM, AUME, SENA azonosítatlan listák.
 * Vercelen: MLC/ARTISJUS/CMO a QUERY_API_URL backendről (adatgép).
 *
 * `mlc: "skip"` — gyors fázis (index + EJI), MLC nélkül.
 * `mlc: "only"` — csak MLC scan + összerakás (második fázis).
 * `mlc: "wait"` (default) — minden egy kérésben (régi viselkedés).
 */
export async function runArtistAudit(input: {
  artistName: string;
  scope: ArtistAuditScope;
  mlc?: ArtistAuditMlcMode;
}): Promise<ArtistAuditResult> {
  const mlcMode = input.mlc ?? "wait";
  const forceRefresh = input.scope === "full";
  const skipEjiRefresh = mlcMode === "only" && !forceRefresh;

  const skipMlc = mlcMode === "skip";
  const mlcUnmatchedSkipped = skipMlc || artistAuditSkipMlcUnmatched();
  const mlcUnclaimedSkipped = skipMlc || artistAuditSkipMlcUnclaimed();

  const [loaded, ejiResult, cmoWebResults] = await Promise.all([
    loadArtistSources(input.artistName, { forceRefresh, mlcMode }).catch((err) => {
      if (shouldUseQueryApi()) throw err;
      return { payload: emptyPayload(input.artistName), viaQueryApi: false };
    }),
    searchEjiByArtist(input.artistName, { forceRefresh: forceRefresh && !skipEjiRefresh }).catch(
      () => null,
    ),
    loadCmoWebResults(input.artistName, forceRefresh && !skipEjiRefresh),
  ]);

  const result = assembleArtistAuditResult({
    artistName: input.artistName,
    scope: input.scope,
    payload: loaded.payload,
    viaQueryApi: loaded.viaQueryApi,
    ejiResult,
    cmoWebResults,
    mlcUnmatchedSkipped,
    mlcUnclaimedSkipped,
  });

  const realIsrcCount = countRealIsrcs(result.rows);
  result.meta.mlcPending =
    mlcMode === "skip" &&
    artistAuditNeedsMlcFollowUp(
      {
        mlcUnmatchedSkipped: artistAuditSkipMlcUnmatched(),
        mlcUnclaimedSkipped: artistAuditSkipMlcUnclaimed(),
        sourceCapabilities: loaded.payload.capabilities,
      },
      { realIsrcCount },
    );

  return result;
}
