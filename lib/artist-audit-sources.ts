import { searchArtisjusByArtist, artisjusIndexAvailable } from "@/lib/artisjus-index";
import { searchCmoByArtist, cmoIndexAvailable } from "@/lib/cmo-index";
import {
  catalogAvailable,
  scanMlcArtist,
  scanMlcUnclaimedArtist,
} from "@/lib/mlc-artist-scan";
import type { ArtistAuditSourcesPayload } from "@/lib/query-api-types";

/** MLC ILIKE cap — keep query API bundle under Vercel 60s limit. */
const MLC_SCAN_RACE_MS = Number(
  process.env.QUERY_API_MLC_RACE_MS ?? process.env.MLC_SCAN_RACE_MS ?? 42_000,
);

function raceMlcScan<T>(promise: Promise<T | null>): Promise<T | null> {
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

  const [mlcUnmatched, mlcUnclaimed, artisjusMatches, cmoMatches] = await Promise.all([
    skipUnmatched
      ? Promise.resolve(null)
      : raceMlcScan(scanMlcArtist(artistName, { forceRefresh })),
    skipUnclaimed
      ? Promise.resolve(null)
      : raceMlcScan(scanMlcUnclaimedArtist(artistName, { forceRefresh })),
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
