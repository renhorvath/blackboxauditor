import { buildAuditSummary } from "@/lib/audit-engine";
import { fetchLocalArtistSources } from "@/lib/artist-audit-sources";
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
import { artistAuditSkipMlcUnclaimed, artistAuditSkipMlcUnmatched, shouldUseQueryApi, queryApiBaseUrl } from "@/lib/query-api-config";
import { isServerlessRuntime } from "@/lib/runtime-env";
import {
  fetchArtistSourcesFromQueryApi,
  fetchCmoWebFromQueryApi,
  QueryApiError,
} from "@/lib/query-api-client";
import type { ArtistAuditSourcesPayload } from "@/lib/query-api-types";
import type { AuditRow, AuditSummary, ArtistAuditMeta, ArtistAuditScope } from "@/lib/types";

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

async function loadArtistSources(
  artistName: string,
  forceRefresh: boolean,
): Promise<{ payload: ArtistAuditSourcesPayload; viaQueryApi: boolean }> {
  // Vercel without QUERY_API_URL — skip local files/python; EJI runs separately.
  if (isServerlessRuntime() && !queryApiBaseUrl()) {
    return {
      payload: {
        artistName,
        mlcUnmatched: null,
        mlcUnclaimed: null,
        artisjusMatches: [],
        cmoMatches: [],
        capabilities: { catalog: false, artisjusIndex: false, cmoIndex: false },
      },
      viaQueryApi: false,
    };
  }

  if (shouldUseQueryApi()) {
    try {
      const payload = await fetchArtistSourcesFromQueryApi(artistName, { forceRefresh });
      return { payload, viaQueryApi: true };
    } catch (err) {
      if (err instanceof QueryApiError) {
        console.error("[artist-audit] Query API failed:", err.message);
      }
      throw err;
    }
  }

  const payload = await fetchLocalArtistSources(artistName, { forceRefresh });
  return { payload, viaQueryApi: false };
}

/**
 * Előadó-ellenőrzés: ARTISJUS, EJI, MLC (USA), AKM, AUME, SENA azonosítatlan listák.
 * Vercelen: MLC/ARTISJUS/CMO a QUERY_API_URL backendről (adatgép).
 */
export async function runArtistAudit(input: {
  artistName: string;
  scope: ArtistAuditScope;
}): Promise<ArtistAuditResult> {
  const forceRefresh = input.scope === "full";

  const [loaded, ejiResult, cmoWebResults] = await Promise.all([
    loadArtistSources(input.artistName, forceRefresh).catch((err) => {
      if (shouldUseQueryApi()) throw err;
      return {
        payload: {
          artistName: input.artistName,
          mlcUnmatched: null,
          mlcUnclaimed: null,
          artisjusMatches: [],
          cmoMatches: [],
          capabilities: { catalog: false, artisjusIndex: false, cmoIndex: false },
        },
        viaQueryApi: false,
      };
    }),
    searchEjiByArtist(input.artistName, { forceRefresh }).catch(() => null),
    (shouldUseQueryApi()
      ? fetchCmoWebFromQueryApi(input.artistName, { forceRefresh })
      : searchCmoWebByArtist(input.artistName, { forceRefresh })
    ).catch(() => []),
  ]);

  const payload = loaded.payload;
  const viaQueryApi = loaded.viaQueryApi;

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
  const cmoWebCount = countCmoWebHits(cmoWebHits);
  const cmoWebFromCache = (cmoWebResults ?? []).length > 0 && (cmoWebResults ?? []).every((r) => r.fromCache);
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
      cmoWebCounts: countCmoWebHitsBySource(cmoWebHits),
      ejiCount,
      ejiFromCache,
      cmoWebFromCache,
      queryApiUsed: viaQueryApi,
      dataBackend,
      mlcScanSource: mlcScan?.scanSource ?? "none",
      mlcUnclaimedScanSource: mlcUnclaimedScan?.scanSource ?? "none",
      mlcUnmatchedSkipped: artistAuditSkipMlcUnmatched(),
      mlcUnclaimedSkipped: artistAuditSkipMlcUnclaimed(),
      sourceCapabilities,
    },
  };
}
