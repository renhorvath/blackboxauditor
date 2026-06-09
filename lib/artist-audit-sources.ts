import { searchArtisjusByArtist, artisjusIndexAvailable } from "@/lib/artisjus-index";
import { searchCmoByArtist, cmoIndexAvailable } from "@/lib/cmo-index";
import {
  catalogAvailable,
  scanMlcArtist,
  scanMlcUnclaimedArtist,
} from "@/lib/mlc-artist-scan";
import type { ArtistAuditSourcesPayload } from "@/lib/query-api-types";

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

  const [mlcUnmatched, mlcUnclaimed] = await Promise.all([
    skipUnmatched
      ? Promise.resolve(null)
      : scanMlcArtist(artistName, { forceRefresh }),
    skipUnclaimed
      ? Promise.resolve(null)
      : scanMlcUnclaimedArtist(artistName, { forceRefresh }),
  ]);

  let artisjusMatches: ReturnType<typeof searchArtisjusByArtist> = [];
  if (artisjusIndexAvailable()) {
    try {
      artisjusMatches = searchArtisjusByArtist(artistName, 150);
    } catch {
      // index optional
    }
  }

  let cmoMatches: ReturnType<typeof searchCmoByArtist> = [];
  if (cmoIndexAvailable()) {
    try {
      cmoMatches = searchCmoByArtist(artistName, { limit: 120 });
    } catch {
      // index optional
    }
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
