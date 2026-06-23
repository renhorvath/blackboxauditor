import type { ArtistAuditMeta } from "@/lib/types";

/** User/ops line under gap summary — enrich ran, skipped, or pending. */
export function formatCatalogEnrichLine(
  meta: Pick<
    ArtistAuditMeta,
    | "catalogEnrichReady"
    | "catalogEnrichSkipReason"
    | "catalogEnrichIsrcCount"
    | "catalogEnrichCreditsFound"
    | "catalogEnrichIswcFilled"
    | "catalogEnrichMlcWorkCount"
    | "catalogEnrichMlcWorks"
    | "catalogEnrichMlcRecordingCount"
    | "catalogEnrichMlcRecordings"
    | "catalogEnrichIsrcTotal"
    | "catalogEnrichSpotifyMetaCount"
    | "catalogEnrichSpotifyCatalogCount"
    | "catalogEnrichCisacFilled"
    | "catalogEnrichCisacCatalogWorks"
    | "catalogEnrichCisacIpi"
    | "catalogEnrichIswcNetFilled"
    | "catalogEnrichMlcTitleMatchCount"
    | "catalogEnrichMlcCatalogSource"
    | "catalogEnrichCatalogSeedCount"
    | "catalogEnrichBeatportSeedCount"
  >,
  enrichBusy?: boolean,
): string | null {
  if (enrichBusy) return null;
  if (meta.catalogEnrichSkipReason === "no_isrc") {
    return "Metaadat enrich: kihagyva — nincs valódi ISRC a sorokban (csak ARTISJUS/CMO szintetikus ID).";
  }
  if (!meta.catalogEnrichReady) return null;

  const queried = meta.catalogEnrichIsrcCount ?? 0;
  const total = meta.catalogEnrichIsrcTotal ?? queried;
  const spotifyMeta = meta.catalogEnrichSpotifyMetaCount ?? 0;
  const spotifyCatalog = meta.catalogEnrichSpotifyCatalogCount ?? 0;
  const found = meta.catalogEnrichCreditsFound ?? 0;
  const iswc = meta.catalogEnrichIswcFilled ?? 0;
  const mlcWorks = meta.catalogEnrichMlcWorkCount ?? 0;
  const mlcRecordings = meta.catalogEnrichMlcRecordingCount ?? 0;
  const cisacFilled = meta.catalogEnrichCisacFilled ?? 0;
  const cisacCatalog = meta.catalogEnrichCisacCatalogWorks ?? 0;
  const iswcNet = meta.catalogEnrichIswcNetFilled ?? 0;
  const mlcTitleMatches = meta.catalogEnrichMlcTitleMatchCount ?? 0;
  const catalogSeed =
    meta.catalogEnrichCatalogSeedCount ?? meta.catalogEnrichBeatportSeedCount ?? 0;

  const parts = [
    `Metaadat enrich kész: ${queried}${total > queried ? `/${total}` : ""} ISRC`,
    spotifyCatalog > 0
      ? `Spotify meta ${spotifyMeta}/${spotifyCatalog}`
      : "Spotify meta 0 (nincs előadó ID vagy API hiba)",
    `credits.fm ${found}`,
  ];
  if (meta.catalogEnrichMlcRecordings && mlcRecordings > 0) {
    parts.push(`MLC recordings ${mlcRecordings}`);
  }
  if (iswc > 0) parts.push(`${iswc} sor ISWC/MLC művel`);
  if (meta.catalogEnrichMlcWorks && mlcWorks > 0) {
    parts.push(`${mlcWorks} MLC works mű`);
  }
  if (mlcTitleMatches > 0) {
    parts.push(`MLC cím-match ${mlcTitleMatches}${meta.catalogEnrichMlcCatalogSource ? ` (${meta.catalogEnrichMlcCatalogSource})` : ""}`);
  }
  if (catalogSeed > 0) {
    parts.push(`catalog seed +${catalogSeed} ISRC`);
  }
  if (cisacCatalog > 0) {
    parts.push(`CISAC katalógus ${cisacCatalog} mű${meta.catalogEnrichCisacIpi ? ` (IPI ${meta.catalogEnrichCisacIpi})` : ""}`);
  }
  if (cisacFilled > 0) {
    parts.push(`CISAC ISWC +${cisacFilled}`);
  }
  if (iswcNet > 0) {
    parts.push(`ISWC Net +${iswcNet}`);
  }
  if (cisacCatalog === 0 && !meta.catalogEnrichCisacIpi && cisacFilled === 0 && iswcNet === 0) {
    parts.push("CISAC: nincs IPI/jogi név (identity wizard)");
  }
  if (meta.catalogEnrichMlcRecordings && mlcRecordings > 0 && mlcWorks === 0) {
    parts.push("MLC works: song code megvan, mű részlet üres");
  } else if (meta.catalogEnrichMlcWorks === false && meta.catalogEnrichMlcRecordings === false && found > 0) {
    parts.push("MLC API: hiányzó MLC_API_KEY");
  }
  if (queried > 0 && found === 0) {
    parts.push(
      "egyetlen ISRC sem szerepel a credits.fm indexben (HU katalógusnál gyakori — nem feltétlenül kulcshiba)",
    );
  }
  return parts.join(" · ");
}
