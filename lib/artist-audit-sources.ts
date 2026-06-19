import { searchArtisjusByArtist, artisjusIndexAvailable } from "@/lib/artisjus-index";
import { searchCmoByArtist, cmoIndexAvailable } from "@/lib/cmo-index";
import {
  catalogAvailable,
  scanMlcArtist,
  scanMlcUnclaimedArtist,
} from "@/lib/mlc-artist-scan";
import { artistAuditSkipMlcUnclaimed, artistAuditSkipMlcUnmatched } from "@/lib/query-api-config";
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

function sourceCapabilities(): ArtistAuditSourcesPayload["capabilities"] {
  return {
    catalog: catalogAvailable(),
    artisjusIndex: artisjusIndexAvailable(),
    cmoIndex: cmoIndexAvailable(),
  };
}

async function fetchArtisjusAndCmo(artistName: string) {
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
  return { artisjusMatches, cmoMatches };
}

async function fetchMlcScans(
  artistName: string,
  options: {
    forceRefresh?: boolean;
    skipMlcUnmatched?: boolean;
    skipMlcUnclaimed?: boolean;
  },
) {
  const forceRefresh = options.forceRefresh ?? false;
  const skipUnmatched = options.skipMlcUnmatched ?? artistAuditSkipMlcUnmatched();
  const skipUnclaimed = options.skipMlcUnclaimed ?? artistAuditSkipMlcUnclaimed();

  let mlcUnmatched: Awaited<ReturnType<typeof scanMlcArtist>> = null;
  let mlcUnclaimed: Awaited<ReturnType<typeof scanMlcUnclaimedArtist>> = null;

  if (skipUnmatched && skipUnclaimed) {
    return { mlcUnmatched, mlcUnclaimed };
  }

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

  return { mlcUnmatched, mlcUnclaimed };
}

/** ARTISJUS + EU CMO index only — typically under a few seconds. */
export async function fetchLocalFastSources(
  artistName: string,
): Promise<Pick<ArtistAuditSourcesPayload, "artistName" | "artisjusMatches" | "cmoMatches" | "capabilities">> {
  const { artisjusMatches, cmoMatches } = await fetchArtisjusAndCmo(artistName);
  return {
    artistName,
    artisjusMatches,
    cmoMatches,
    capabilities: sourceCapabilities(),
  };
}

/** MLC DuckDB / TSV scans only. */
export async function fetchLocalMlcSources(
  artistName: string,
  options?: {
    forceRefresh?: boolean;
    skipMlcUnmatched?: boolean;
    skipMlcUnclaimed?: boolean;
  },
): Promise<Pick<ArtistAuditSourcesPayload, "mlcUnmatched" | "mlcUnclaimed">> {
  return fetchMlcScans(artistName, options ?? {});
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
  const [fast, mlc] = await Promise.all([
    fetchLocalFastSources(artistName),
    fetchMlcScans(artistName, options ?? {}),
  ]);
  return { ...fast, ...mlc };
}
