import { searchArtisjusByArtist, artisjusIndexAvailable } from "@/lib/artisjus-index";
import { searchCmoByArtist, cmoIndexAvailable } from "@/lib/cmo-index";
import {
  catalogAvailable,
  scanMlcArtist,
  scanMlcUnclaimedArtist,
} from "@/lib/mlc-artist-scan";
import type { ArtistAuditSourcesPayload } from "@/lib/query-api-types";

function mlcScanRaceMs(): number {
  const explicit = process.env.MLC_SCAN_RACE_MS?.trim();
  if (explicit !== undefined && explicit !== "") {
    const n = Number(explicit);
    if (Number.isFinite(n)) return n;
  }
  if (process.env.MLC_USE_DUCKDB?.trim().toLowerCase() === "false") {
    return 0;
  }
  // DuckDB artist queries on a full catalog often take 2–4+ minutes — do not cut off at 85s.
  if (catalogAvailable()) return 0;
  return 85_000;
}

function raceMlcScan<T>(promise: Promise<T | null>): Promise<T | null> {
  const MLC_SCAN_RACE_MS = mlcScanRaceMs();
  if (!Number.isFinite(MLC_SCAN_RACE_MS) || MLC_SCAN_RACE_MS <= 0) return promise;
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn("[artist-sources] MLC scan race timeout — returning partial results");
        resolve(null);
      }, MLC_SCAN_RACE_MS);
    }),
  ]);
}

/**
 * Load MLC + ARTISJUS + CMO from local files (data machine).
 * EJI stays on the caller — web scrape runs wherever the UI API lives.
 */
export async function fetchLocalArtistSources(
  artistName: string,
  options?: {
    forceRefresh?: boolean;
    skipMlcUnmatched?: boolean;
    skipMlcUnclaimed?: boolean;
  },
): Promise<ArtistAuditSourcesPayload> {
  const forceRefresh = options?.forceRefresh ?? false;
  const skipUnmatched = options?.skipMlcUnmatched ?? false;
  const skipUnclaimed = options?.skipMlcUnclaimed ?? false;

  const [artisjusMatches, cmoMatches] = await Promise.all([
    artisjusIndexAvailable()
      ? Promise.resolve().then(() => {
          try {
            return searchArtisjusByArtist(artistName, 150);
          } catch {
            return [];
          }
        })
      : Promise.resolve([]),
    cmoIndexAvailable()
      ? Promise.resolve().then(() => {
          try {
            return searchCmoByArtist(artistName, { limit: 120 });
          } catch {
            return [];
          }
        })
      : Promise.resolve([]),
  ]);

  // DuckDB: one catalog file — parallel unmatched+unclaimed contends on lock and doubles wall time.
  let mlcUnmatched: Awaited<ReturnType<typeof scanMlcArtist>> = null;
  let mlcUnclaimed: Awaited<ReturnType<typeof scanMlcUnclaimedArtist>> = null;

  if (catalogAvailable()) {
    if (!skipUnmatched) {
      mlcUnmatched = await raceMlcScan(scanMlcArtist(artistName, { forceRefresh }));
    }
    if (!skipUnclaimed) {
      mlcUnclaimed = await raceMlcScan(scanMlcUnclaimedArtist(artistName, { forceRefresh }));
    }
  } else {
    [mlcUnmatched, mlcUnclaimed] = await Promise.all([
      skipUnmatched
        ? Promise.resolve(null)
        : raceMlcScan(scanMlcArtist(artistName, { forceRefresh })),
      skipUnclaimed
        ? Promise.resolve(null)
        : raceMlcScan(scanMlcUnclaimedArtist(artistName, { forceRefresh })),
    ]);
  }

  return {
    artistName,
    mlcUnmatched,
    mlcUnclaimed,
    artisjusMatches,
    cmoMatches,
    capabilities: {
      catalog: catalogAvailable(),
      artisjusIndex: artisjusIndexAvailable(),
      cmoIndex: cmoIndexAvailable(),
    },
  };
}
