import type { ArtisjusArtistMatch } from "@/lib/artisjus-types";
import type { CmoArtistMatch } from "@/lib/cmo-types";
import type { CmoWebSearchResult } from "@/lib/cmo-web/web-types";
import type { EjiSearchResult } from "@/lib/cmo-web/eji-types";
import type { MlcArtistScanResult, MlcUnclaimedScanResult } from "@/lib/mlc-artist-scan";

/** Payload exchanged between query API (data machine) and Vercel proxy. */
export interface ArtistAuditSourcesPayload {
  artistName: string;
  mlcUnmatched: MlcArtistScanResult | null;
  mlcUnclaimed: MlcUnclaimedScanResult | null;
  artisjusMatches: ArtisjusArtistMatch[];
  cmoMatches: CmoArtistMatch[];
  /** Which indexes/catalog were available on the query host. */
  capabilities: {
    catalog: boolean;
    artisjusIndex: boolean;
    cmoIndex: boolean;
  };
}

export interface QueryApiHealthResponse {
  ok: boolean;
  version: number;
  capabilities: ArtistAuditSourcesPayload["capabilities"];
}

export interface CmoWebSearchPayload {
  artistName: string;
  results: CmoWebSearchResult[];
}

export interface EjiSearchPayload {
  artistName: string;
  result: EjiSearchResult;
}
