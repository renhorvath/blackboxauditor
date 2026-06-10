import { searchArtisjusByArtist, artisjusIndexAvailable } from "@/lib/artisjus-index";
import { searchCmoByArtist, cmoIndexAvailable } from "@/lib/cmo-index";
import {
  catalogAvailable,
  scanMlcArtist,
  scanMlcUnclaimedArtist,
} from "@/lib/mlc-artist-scan";
import type { ArtistAuditSourcesPayload } from "@/lib/query-api-types";

function mlcRaceMs(kind: "bundle" | "only"): number {
  if (kind === "only") {
    const n = Number(process.env.QUERY_API_MLC_ONLY_RACE_MS ?? 54_000);
    return Number.isFinite(n) && n > 0 ? n : 54_000;
  }
  const n = Number(process.env.QUERY_API_MLC_RACE_MS ?? 40_000);
  return Number.isFinite(n) && n > 0 ? n : 40_000;
}

function raceMlcScan<T>(promise: Promise<T | null>, raceMs: number): Promise<T | null> {
  if (!Number.isFinite(raceMs) || raceMs <= 0) return promise;
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => {
        console.warn("[artist-sources] MLC scan race timeout — returning partial results");
        resolve(null);
      }, raceMs);
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

  const mlcRace = mlcRaceMs("bundle");
  const [mlcUnmatched, mlcUnclaimed, artisjusMatches, cmoMatches] = await Promise.all([
    skipUnmatched
      ? Promise.resolve(null)
      : raceMlcScan(scanMlcArtist(artistName, { forceRefresh }), mlcRace),
    skipUnclaimed
      ? Promise.resolve(null)
      : raceMlcScan(scanMlcUnclaimedArtist(artistName, { forceRefresh }), mlcRace),
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

/** MLC-only scan — used in phase-2 request (dedicated 60s Vercel budget). */
export async function fetchLocalArtistMlcOnly(
  artistName: string,
  options?: { forceRefresh?: boolean },
): Promise<Pick<ArtistAuditSourcesPayload, "artistName" | "mlcUnmatched" | "mlcUnclaimed">> {
  const forceRefresh = options?.forceRefresh ?? false;
  const mlcRace = mlcRaceMs("only");
  const skipUnmatched = process.env.ARTIST_AUDIT_SKIP_MLC_UNMATCHED?.trim().toLowerCase() === "true"
    || process.env.ARTIST_AUDIT_SKIP_MLC?.trim().toLowerCase() === "true";
  const skipUnclaimed = process.env.ARTIST_AUDIT_SKIP_MLC_ALL?.trim().toLowerCase() === "true";

  const [mlcUnmatched, mlcUnclaimed] = await Promise.all([
    skipUnmatched
      ? Promise.resolve(null)
      : raceMlcScan(scanMlcArtist(artistName, { forceRefresh }), mlcRace),
    skipUnclaimed
      ? Promise.resolve(null)
      : raceMlcScan(scanMlcUnclaimedArtist(artistName, { forceRefresh }), mlcRace),
  ]);

  return { artistName, mlcUnmatched, mlcUnclaimed };
}
