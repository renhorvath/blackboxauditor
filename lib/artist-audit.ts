import { buildAuditSummary } from "@/lib/audit-engine";
import { fetchLocalArtistMlcOnly, fetchLocalArtistSources } from "@/lib/artist-audit-sources";
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
import {
  fetchArtistMlcFromQueryApi,
  fetchArtistSourcesFromQueryApi,
  QueryApiError,
} from "@/lib/query-api-client";
import type { ArtistAuditSourcesPayload, ArtistMlcPayload } from "@/lib/query-api-types";
import { isServerlessRuntime } from "@/lib/runtime-env";
import type { AuditRow, AuditSummary, ArtistAuditMeta, ArtistAuditScope } from "@/lib/types";

export type ArtistAuditPhase = "core" | "mlc" | "full";

export interface ArtistAuditResult {
  rows: AuditRow[];
  summary: AuditSummary;
  meta: ArtistAuditMeta;
}

export interface ArtistAuditMlcResult {
  phase: "mlc";
  mlcUnmatched: MlcArtistScanResult | null;
  mlcUnclaimed: MlcUnclaimedScanResult | null;
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
  skipMlc: boolean,
): Promise<{ payload: ArtistAuditSourcesPayload; viaQueryApi: boolean }> {
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
      const payload = await fetchArtistSourcesFromQueryApi(artistName, {
        forceRefresh,
        skipMlc,
      });
      return { payload, viaQueryApi: true };
    } catch (err) {
      if (err instanceof QueryApiError) {
        console.error("[artist-audit] Query API failed:", err.message);
      }
      throw err;
    }
  }

  const payload = await fetchLocalArtistSources(artistName, {
    forceRefresh,
    skipMlcUnmatched: skipMlc,
    skipMlcUnclaimed: skipMlc,
  });
  return { payload, viaQueryApi: false };
}

function assembleArtistAudit(
  artistName: string,
  scope: ArtistAuditScope,
  payload: ArtistAuditSourcesPayload,
  viaQueryApi: boolean,
  ejiResult: Awaited<ReturnType<typeof searchEjiByArtist>> | null,
  cmoWebResults: Awaited<ReturnType<typeof searchCmoWebByArtist>>,
  options?: { mlcPending?: boolean; auditWarning?: string },
): ArtistAuditResult {
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

  const mlcPending = options?.mlcPending === true;

  return {
    rows,
    summary: buildAuditSummary(rows),
    meta: {
      artistName,
      scope,
      spotifyTrackCount: 0,
      isrcCount: mlcPending
        ? 0
        : (mlcScan?.uniqueIsrcCount ?? 0) + (mlcUnclaimedScan?.uniqueIsrcCount ?? 0),
      mlcUnmatchedCount: mlcPending ? 0 : (mlcScan?.uniqueIsrcCount ?? 0),
      mlcUnclaimedCount: mlcPending ? 0 : (mlcUnclaimedScan?.uniqueIsrcCount ?? 0),
      artisjusCount: artisjusMatches.length,
      cmoCounts: countCmoMatchesBySource(cmoMatches),
      cmoWebCounts: countCmoWebHitsBySource(cmoWebHits),
      ejiCount,
      ejiFromCache,
      cmoWebFromCache,
      queryApiUsed: viaQueryApi,
      dataBackend,
      mlcScanSource: mlcPending ? "none" : (mlcScan?.scanSource ?? "none"),
      mlcUnclaimedScanSource: mlcPending ? "none" : (mlcUnclaimedScan?.scanSource ?? "none"),
      mlcUnmatchedSkipped: mlcPending ? false : artistAuditSkipMlcUnmatched(),
      mlcUnclaimedSkipped: mlcPending ? false : artistAuditSkipMlcUnclaimed(),
      mlcPending,
      auditWarning: options?.auditWarning,
      sourceCapabilities,
    },
  };
}

async function runArtistAuditCore(
  artistName: string,
  scope: ArtistAuditScope,
  forceRefresh: boolean,
): Promise<ArtistAuditResult> {
  let payload: ArtistAuditSourcesPayload;
  let viaQueryApi: boolean;
  let ejiResult: Awaited<ReturnType<typeof searchEjiByArtist>> | null;
  let cmoWebResults: Awaited<ReturnType<typeof searchCmoWebByArtist>>;
  let auditWarning: string | undefined;

  if (shouldUseQueryApi()) {
    try {
      const bundle = await fetchArtistSourcesFromQueryApi(artistName, {
        forceRefresh,
        bundle: "core",
      });
      payload = bundle;
      viaQueryApi = true;
      ejiResult = bundle.eji ?? null;
      cmoWebResults = bundle.cmoWebResults ?? [];
    } catch (err) {
      if (!(err instanceof QueryApiError)) throw err;
      console.error("[artist-audit] core phase query API failed:", err.message);
      auditWarning =
        "Az adatgép átmenetileg nem elérhető — próbáld újra pár másodperc múlva.";
      payload = {
        artistName,
        mlcUnmatched: null,
        mlcUnclaimed: null,
        artisjusMatches: [],
        cmoMatches: [],
        capabilities: { catalog: false, artisjusIndex: false, cmoIndex: false },
      };
      viaQueryApi = false;
      ejiResult = null;
      cmoWebResults = [];
    }
  } else {
    const [loaded, eji, cmoWeb] = await Promise.all([
      loadArtistSources(artistName, forceRefresh, true),
      searchEjiByArtist(artistName, { forceRefresh }).catch(() => null),
      searchCmoWebByArtist(artistName, { forceRefresh }).catch(() => []),
    ]);
    payload = loaded.payload;
    viaQueryApi = loaded.viaQueryApi;
    ejiResult = eji;
    cmoWebResults = cmoWeb;
  }

  return assembleArtistAudit(artistName, scope, payload, viaQueryApi, ejiResult, cmoWebResults, {
    mlcPending: true,
    auditWarning,
  });
}

async function runArtistAuditMlc(
  artistName: string,
  forceRefresh: boolean,
): Promise<ArtistAuditMlcResult> {
  let mlcPayload: ArtistMlcPayload;

  if (shouldUseQueryApi()) {
    mlcPayload = await fetchArtistMlcFromQueryApi(artistName, { forceRefresh });
  } else {
    mlcPayload = await fetchLocalArtistMlcOnly(artistName, { forceRefresh });
  }

  return {
    phase: "mlc",
    mlcUnmatched: shouldUseQueryApi()
      ? asRemoteScan(mlcPayload.mlcUnmatched)
      : mlcPayload.mlcUnmatched,
    mlcUnclaimed: shouldUseQueryApi()
      ? asRemoteScan(mlcPayload.mlcUnclaimed)
      : mlcPayload.mlcUnclaimed,
  };
}

async function runArtistAuditFull(
  artistName: string,
  scope: ArtistAuditScope,
  forceRefresh: boolean,
): Promise<ArtistAuditResult> {
  let payload: ArtistAuditSourcesPayload;
  let viaQueryApi: boolean;
  let ejiResult: Awaited<ReturnType<typeof searchEjiByArtist>> | null;
  let cmoWebResults: Awaited<ReturnType<typeof searchCmoWebByArtist>>;

  if (shouldUseQueryApi()) {
    const bundle = await fetchArtistSourcesFromQueryApi(artistName, {
      forceRefresh,
      bundle: "full",
    });
    payload = bundle;
    viaQueryApi = true;
    ejiResult = bundle.eji ?? null;
    cmoWebResults = bundle.cmoWebResults ?? [];
  } else {
    const [loaded, eji, cmoWeb] = await Promise.all([
      loadArtistSources(artistName, forceRefresh, false),
      searchEjiByArtist(artistName, { forceRefresh }).catch(() => null),
      searchCmoWebByArtist(artistName, { forceRefresh }).catch(() => []),
    ]);
    payload = loaded.payload;
    viaQueryApi = loaded.viaQueryApi;
    ejiResult = eji;
    cmoWebResults = cmoWeb;
  }

  return assembleArtistAudit(artistName, scope, payload, viaQueryApi, ejiResult, cmoWebResults);
}

/**
 * Előadó-ellenőrzés: ARTISJUS, EJI, MLC (USA), AKM, AUME, SENA azonosítatlan listák.
 * Vercelen: kétfázisú (core → mlc) a 60s limit miatt; MLC külön kérésben marad bekapcsolva.
 */
export async function runArtistAudit(input: {
  artistName: string;
  scope: ArtistAuditScope;
  phase?: ArtistAuditPhase;
}): Promise<ArtistAuditResult | ArtistAuditMlcResult> {
  const forceRefresh = input.scope === "full";
  const phase = input.phase ?? "full";

  if (phase === "core") {
    return runArtistAuditCore(input.artistName, input.scope, forceRefresh);
  }
  if (phase === "mlc") {
    return runArtistAuditMlc(input.artistName, forceRefresh);
  }
  return runArtistAuditFull(input.artistName, input.scope, forceRefresh);
}
