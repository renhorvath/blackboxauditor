import { catalogEnrichProfile } from "@/lib/audit-core/enrich-profile";
import type { EnrichLegId } from "@/lib/audit-core/enrich-plan";
import { buildAuditSummary } from "@/lib/audit-engine";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { summarizeCatalogGaps } from "@/lib/audit-core/derive-gap-badges";
import { computeCatalogReady } from "@/lib/audit-core/catalog-lens";
import { applyCisacIswcEnrichment, applyIswcNetEnrichment } from "@/lib/cisac-enrich";
import {
  enrichArtistAuditRows,
  type CatalogEnrichResult,
} from "@/lib/artist-audit-enrich";
import { isServerlessRuntime } from "@/lib/runtime-env";
import { mlcWorksApiAvailable } from "@/lib/mlc-works-api";
import {
  fetchSpotifyArtistIsrcMap,
  resolveSpotifyArtistIdByName,
  spotifyApiAvailable,
} from "@/lib/spotify";
import type { AuditRow, SearchTrackHit } from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

function normalizeIsrcKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "");
}

async function resolveSpotifyMap(
  artistName: string,
  spotifyArtistId?: string,
): Promise<{
  map: Map<string, SearchTrackHit>;
  catalogCount: number;
  artistResolved: boolean;
  artistId?: string;
}> {
  let artistId = spotifyArtistId?.trim();
  if (!artistId && artistName && spotifyApiAvailable()) {
    try {
      artistId = (await resolveSpotifyArtistIdByName(artistName)) ?? undefined;
    } catch (err) {
      console.warn("[enrich-leg] Spotify artist resolve failed:", err);
    }
  }
  if (!artistId || !spotifyApiAvailable()) {
    return { map: new Map(), catalogCount: 0, artistResolved: Boolean(artistId) };
  }
  try {
    const spotify = await fetchSpotifyArtistIsrcMap(artistId);
    return {
      map: spotify.map,
      catalogCount: spotify.map.size,
      artistResolved: true,
      artistId,
    };
  } catch (err) {
    console.warn("[enrich-leg] Spotify discography failed:", err);
    return { map: new Map(), catalogCount: 0, artistResolved: true, artistId };
  }
}

function applySpotifyTitlesToRows(
  rows: AuditRow[],
  spotifyByIsrc: Map<string, SearchTrackHit>,
): AuditRow[] {
  return rows.map((row) => {
    const key = normalizeIsrcKey(row.isrc ?? "");
    const spotify = key ? spotifyByIsrc.get(key) : undefined;
    if (!spotify) return row;
    return {
      ...row,
      title: row.title || spotify.title,
      artist: row.artist || spotify.artists.join(", "),
    };
  });
}

function countSpotifyMetaMatches(
  rows: AuditRow[],
  spotifyByIsrc: Map<string, SearchTrackHit>,
): number {
  let n = 0;
  for (const row of rows) {
    const key = normalizeIsrcKey(row.isrc ?? "");
    if (key && !isSyntheticAuditIsrc(row.isrc ?? "") && spotifyByIsrc.has(key)) n += 1;
  }
  return n;
}

export interface LegEnrichResult {
  rows: AuditRow[];
  summary: ReturnType<typeof buildAuditSummary>;
  meta: CatalogEnrichResult["meta"] & { catalogEnrichLeg?: EnrichLegId };
}

export async function enrichAuditLeg(
  leg: EnrichLegId,
  rows: AuditRow[],
  options: {
    artistName?: string;
    artistSlug?: string | null;
    spotifyArtistId?: string;
    legalName?: string | null;
    writerIpi?: string | null;
  },
): Promise<LegEnrichResult> {
  const artistName = options.artistName ?? "";
  const artistSlug = options.artistSlug?.trim() || null;
  const profile = catalogEnrichProfile(rows);

  if (leg === "local") {
    const spotify = await resolveSpotifyMap(artistName, options.spotifyArtistId);
    const net = await applyIswcNetEnrichment(rows, {
      artistSlug,
      spotifyByIsrc: spotify.map,
    });
    const outRows =
      profile === "composer"
        ? applySpotifyTitlesToRows(net.rows, spotify.map)
        : net.rows;
    const realRows = outRows.filter(
      (r) => r.isrc?.trim() && !isSyntheticAuditIsrc(r.isrc),
    );
    return {
      rows: outRows,
      summary: buildAuditSummary(outRows),
      meta: {
        catalogEnrichReady: false,
        catalogEnrichProfile: profile,
        catalogEnrichLeg: leg,
        catalogEnrichIswcNetFilled: net.iswcNetFilled,
        catalogEnrichIswcNetAttempted: Boolean(artistSlug),
        catalogEnrichIsrcCount: realRows.length,
        catalogEnrichIsrcTotal: realRows.length,
        catalogEnrichSpotifyMetaCount:
          profile === "composer" ? countSpotifyMetaMatches(outRows, spotify.map) : 0,
        catalogEnrichSpotifyCatalogCount: spotify.catalogCount,
        catalogEnrichSpotifyArtistResolved: spotify.artistResolved,
        catalogEnrichCreditsFound: 0,
        catalogEnrichIswcFilled: outRows.filter((r) => r.iswc?.trim()).length,
        catalogEnrichCisacFilled: 0,
        catalogEnrichCisacCatalogWorks: 0,
        catalogEnrichCisacIpi: null,
        catalogEnrichCreditsFm: false,
        catalogEnrichMlcRecordings: false,
        catalogEnrichMlcRecordingCount: 0,
        catalogEnrichMlcWorks: false,
        catalogEnrichMlcWorkCount: 0,
        catalogEnrichMlcWriterSkipReason: profile === "composer" ? "synthetic_catalog" : undefined,
        catalogEnrichMlcApiAvailable: mlcWorksApiAvailable(),
        catalogReady: computeCatalogReady(
          outRows,
          outRows.filter((r) => r.artisjusMatched).length,
        ),
      },
    };
  }

  if (leg === "spotify") {
    const spotify = await resolveSpotifyMap(artistName, options.spotifyArtistId);
    const outRows = applySpotifyTitlesToRows(rows, spotify.map);
    const realRows = outRows.filter(
      (r) => r.isrc?.trim() && !isSyntheticAuditIsrc(r.isrc),
    );
    return {
      rows: outRows,
      summary: buildAuditSummary(outRows),
      meta: {
        catalogEnrichReady: false,
        catalogEnrichProfile: profile,
        catalogEnrichLeg: leg,
        catalogEnrichIsrcCount: realRows.length,
        catalogEnrichIsrcTotal: realRows.length,
        catalogEnrichSpotifyMetaCount: countSpotifyMetaMatches(outRows, spotify.map),
        catalogEnrichSpotifyCatalogCount: spotify.catalogCount,
        catalogEnrichSpotifyArtistResolved: spotify.artistResolved,
        catalogEnrichCreditsFound: 0,
        catalogEnrichIswcFilled: outRows.filter((r) => r.iswc?.trim()).length,
        catalogEnrichCisacFilled: 0,
        catalogEnrichCisacCatalogWorks: 0,
        catalogEnrichCisacIpi: null,
        catalogEnrichIswcNetAttempted: Boolean(artistSlug),
        catalogEnrichCreditsFm: false,
        catalogEnrichMlcRecordings: false,
        catalogEnrichMlcRecordingCount: 0,
        catalogEnrichMlcWorks: false,
        catalogEnrichMlcWorkCount: 0,
        catalogEnrichMlcWriterSkipReason: profile === "composer" ? "synthetic_catalog" : undefined,
        catalogEnrichMlcApiAvailable: mlcWorksApiAvailable(),
        catalogReady: computeCatalogReady(
          outRows,
          outRows.filter((r) => r.artisjusMatched).length,
        ),
      },
    };
  }

  if (leg === "isrc") {
    const maxIsrcs = isServerlessRuntime()
      ? Number.parseInt(process.env.CATALOG_ENRICH_SERVERLESS_MAX_ISRCS ?? "50", 10) || 50
      : undefined;
    const full = await enrichArtistAuditRows(rows, {
      ...options,
      legs: ["isrc"],
      maxIsrcs,
    });
    return {
      rows: full.rows,
      summary: full.summary,
      meta: { ...full.meta, catalogEnrichReady: false, catalogEnrichLeg: leg },
    };
  }

  const spotify = await resolveSpotifyMap(artistName, options.spotifyArtistId);
  const cisac = await applyCisacIswcEnrichment(rows, {
    artistName,
    artistSlug,
    legalName: options.legalName,
    writerIpi: options.writerIpi,
    spotifyByIsrc: spotify.map,
    skipIswcNet: true,
  });
  const outRows = cisac.rows;
  const problemRows = outRows.filter(rowHasPayoutProblem);
  return {
    rows: outRows,
    summary: buildAuditSummary(outRows),
    meta: {
      catalogEnrichReady: false,
      catalogEnrichProfile: profile,
      catalogEnrichLeg: leg,
      catalogEnrichIsrcCount: 0,
      catalogEnrichIsrcTotal: 0,
      catalogEnrichSpotifyMetaCount: countSpotifyMetaMatches(outRows, spotify.map),
      catalogEnrichSpotifyCatalogCount: spotify.catalogCount,
      catalogEnrichSpotifyArtistResolved: spotify.artistResolved,
      catalogEnrichCreditsFound: 0,
      catalogEnrichIswcFilled: outRows.filter((r) => r.iswc?.trim()).length,
      catalogEnrichCisacFilled: cisac.cisacFilled,
      catalogEnrichCisacCatalogWorks: cisac.cisacCatalogWorks,
      catalogEnrichCisacIpi: cisac.cisacIpiUsed,
      catalogEnrichCisacTitleLookups: cisac.cisacTitleLookups,
      catalogEnrichLegalNameUsed: Boolean(options.legalName?.trim()),
      catalogEnrichIswcNetFilled: cisac.iswcNetFilled,
      catalogEnrichIswcNetAttempted: Boolean(artistSlug),
      catalogEnrichCreditsFm: false,
      catalogEnrichMlcRecordings: false,
      catalogEnrichMlcRecordingCount: 0,
      catalogEnrichMlcWorks: false,
      catalogEnrichMlcWorkCount: 0,
      catalogEnrichMlcWriterSkipReason: profile === "composer" ? "synthetic_catalog" : undefined,
      catalogEnrichMlcApiAvailable: mlcWorksApiAvailable(),
      catalogReady: computeCatalogReady(
        outRows,
        outRows.filter((r) => r.artisjusMatched).length,
      ),
      catalogGaps: artistName ? summarizeCatalogGaps(problemRows, artistName) : undefined,
    },
  };
}
