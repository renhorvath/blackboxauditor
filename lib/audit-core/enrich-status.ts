import type { ArtistAuditMeta } from "@/lib/types";

export type EnrichLegStatus = "pending" | "running" | "done" | "skipped" | "warn";

export interface EnrichStatusLeg {
  id: "spotify" | "credits" | "mlc" | "mlc-writer" | "cisac" | "iswc-net";
  label: string;
  status: EnrichLegStatus;
  detail: string;
}

function leg(
  id: EnrichStatusLeg["id"],
  label: string,
  status: EnrichLegStatus,
  detail: string,
): EnrichStatusLeg {
  return { id, label, status, detail };
}

/** Per-leg enrich status for the UI checklist. */
export function buildEnrichStatusLegs(
  meta: ArtistAuditMeta | null | undefined,
  enrichBusy: boolean,
  enrichElapsedMs = 0,
): EnrichStatusLeg[] {
  if (!meta) return [];

  if (enrichBusy && !meta.catalogEnrichReady) {
    const busyLeg = meta.catalogEnrichLegBusy;
    const done = new Set(meta.catalogEnrichLegsDone ?? []);
    const phase =
      busyLeg ??
      (done.has("local") && done.has("spotify")
        ? "cisac"
        : done.has("local")
          ? "spotify"
          : enrichElapsedMs < 12_000
            ? "spotify"
            : "cisac");
    const runningDetail =
      phase === "local" || (phase === "spotify" && !done.has("local"))
        ? "Helyi ISWC map + Spotify diszkográfia…"
        : phase === "spotify"
          ? "Spotify diszkográfia…"
          : phase === "isrc"
            ? "credits.fm + MLC ISRC API…"
            : phase === "cisac"
              ? "CISAC IPI katalógus (háttér, nem blokkol)…"
              : "Összefoglalás…";
    const legStatus = (id: EnrichStatusLeg["id"]): EnrichLegStatus => {
      if (id === "spotify" && (done.has("local") || done.has("spotify"))) return done.has("spotify") ? "done" : "running";
      if (id === "iswc-net" && done.has("local")) return "done";
      if (id === "cisac" && busyLeg === "cisac") return "running";
      if (id === "cisac" && done.has("cisac")) return "done";
      if (id === phase) return "running";
      return "pending";
    };
    const legDetail = (id: EnrichStatusLeg["id"], pending: string): string =>
      id === phase ? runningDetail : pending;

    return [
      leg("spotify", "Spotify ISRC", legStatus("spotify"), legDetail("spotify", "Várakozik")),
      leg("credits", "credits.fm", legStatus("credits"), legDetail("credits", "Várakozik")),
      leg("mlc", "MLC API", legStatus("mlc"), legDetail("mlc", "Várakozik")),
      leg(
        "mlc-writer",
        "MLC writer katalógus",
        legStatus("mlc-writer"),
        legDetail("mlc-writer", "Várakozik"),
      ),
      leg("cisac", "CISAC API (élő)", legStatus("cisac"), legDetail("cisac", "Várakozik")),
      leg("iswc-net", "Helyi ISWC map", legStatus("iswc-net"), legDetail("iswc-net", "Várakozik")),
    ];
  }

  if (meta.catalogEnrichSkipReason === "no_isrc") {
    return [
      leg(
        "spotify",
        "Spotify ISRC",
        "skipped",
        "Nincs ISRC és nincs cím — enrich nem indítható.",
      ),
      leg("credits", "credits.fm", "skipped", "ISRC nélkül nem fut."),
      leg("mlc", "MLC API", "skipped", "ISRC nélkül nem fut."),
      leg("mlc-writer", "MLC writer katalógus", "skipped", "ISRC nélkül nem fut."),
      leg("cisac", "CISAC API (élő)", "skipped", "ISRC nélkül nem fut."),
      leg("iswc-net", "Helyi ISWC map", "skipped", "ISRC nélkül nem fut."),
    ];
  }

  if (!meta.catalogEnrichReady) {
    if (!enrichBusy && meta.catalogEnrichProfile) {
      return [
        leg("spotify", "Spotify ISRC", "warn", "Metaadat scan megszakadt vagy timeout — indítsd újra az auditot."),
        leg("credits", "credits.fm", "pending", "—"),
        leg("mlc", "MLC API", "pending", "—"),
        leg("mlc-writer", "MLC writer katalógus", "pending", "—"),
        leg("cisac", "CISAC API (élő)", "pending", "—"),
        leg("iswc-net", "Helyi ISWC map", "pending", "—"),
      ];
    }
    return [
      leg("spotify", "Spotify ISRC", "pending", "Még nem indult el."),
      leg("credits", "credits.fm", "pending", "Még nem indult el."),
      leg("mlc", "MLC API", "pending", "Még nem indult el."),
      leg("mlc-writer", "MLC writer katalógus", "pending", "Még nem indult el."),
      leg("cisac", "CISAC API (élő)", "pending", "Még nem indult el."),
      leg("iswc-net", "Helyi ISWC map", "pending", "Még nem indult el."),
    ];
  }

  const queried = meta.catalogEnrichIsrcCount ?? 0;
  const spotifyCatalog = meta.catalogEnrichSpotifyCatalogCount ?? 0;
  const spotifyMeta = meta.catalogEnrichSpotifyMetaCount ?? 0;
  const creditsFound = meta.catalogEnrichCreditsFound ?? 0;
  const mlcRecordings = meta.catalogEnrichMlcRecordingCount ?? 0;
  const mlcWorks = meta.catalogEnrichMlcWorkCount ?? 0;
  const cisacCatalog = meta.catalogEnrichCisacCatalogWorks ?? 0;
  const cisacFilled = meta.catalogEnrichCisacFilled ?? 0;
  const cisacTitleLookups = meta.catalogEnrichCisacTitleLookups ?? 0;
  const cisacIpi = meta.catalogEnrichCisacIpi?.trim();
  const iswcNet = meta.catalogEnrichIswcNetFilled ?? 0;
  const legalNameUsed = meta.catalogEnrichLegalNameUsed === true;

  const spotifyLeg = (() => {
    if (meta.catalogEnrichSpotifyArtistResolved === false) {
      return leg(
        "spotify",
        "Spotify ISRC",
        "warn",
        "Nem található Spotify előadó — ISRC párosítás cím alapján.",
      );
    }
    if (spotifyCatalog === 0) {
      return leg(
        "spotify",
        "Spotify ISRC",
        "warn",
        "0 ISRC a Spotify katalógusban (üres diszkográfia vagy rossz előadó).",
      );
    }
    if (queried === 0) {
      return leg(
        "spotify",
        "Spotify ISRC",
        "done",
        `${spotifyCatalog} ISRC a diszkográfiában · audit sorok szintetikus ISRC-vel (cím-alapú enrich)`,
      );
    }
    return leg(
      "spotify",
      "Spotify ISRC",
      "done",
      `${spotifyCatalog} ISRC · ${spotifyMeta}/${queried} audit sorhoz párosítva`,
    );
  })();

  const creditsLeg = leg(
    "credits",
    "credits.fm",
    queried === 0 ? "skipped" : creditsFound > 0 ? "done" : "warn",
    queried === 0
      ? "Nincs lekérdezhető ISRC."
      : creditsFound > 0
        ? `${creditsFound}/${queried} ISRC a credits.fm indexben`
        : `0/${queried} — HU katalógusnál gyakori, nem feltétlenül hiba`,
  );

  const mlcLeg = (() => {
    if (!meta.catalogEnrichMlcApiAvailable) {
      return leg("mlc", "MLC API (ISRC)", "skipped", "MLC_API_KEY / MLC_PASSWORD hiányzik (.env.local).");
    }
    if ((meta.catalogEnrichIsrcCount ?? 0) === 0) {
      return leg(
        "mlc",
        "MLC API (ISRC)",
        "skipped",
        "Nincs valódi ISRC — ARTISJUS szintetikus ID-knél csak writer katalógus fut.",
      );
    }
    if (!meta.catalogEnrichMlcRecordings && !meta.catalogEnrichMlcWorks) {
      return leg("mlc", "MLC API (ISRC)", "warn", "ISRC-k lekérdezve — 0 MLC találat.");
    }
    const parts: string[] = [];
    if (meta.catalogEnrichMlcRecordings && mlcRecordings > 0) {
      parts.push(`${mlcRecordings} recording`);
    }
    if (meta.catalogEnrichMlcWorks && mlcWorks > 0) {
      parts.push(`${mlcWorks} work`);
    }
    if (parts.length === 0) {
      return leg("mlc", "MLC API (ISRC)", "warn", "Lekérdezve — 0 MLC találat.");
    }
    return leg("mlc", "MLC API (ISRC)", "done", parts.join(" · "));
  })();

  const mlcWriterLeg = (() => {
    const lookups = meta.catalogEnrichMlcWriterSearchLookups ?? 0;
    const matched = meta.catalogEnrichMlcWriterTitlesMatched ?? 0;
    const filled = meta.catalogEnrichMlcWriterSearchFilled ?? 0;
    const titlesQueried = meta.catalogEnrichMlcWriterTitlesQueried ?? 0;
    const skip = meta.catalogEnrichMlcWriterSkipReason;

    if (skip === "no_api") {
      return leg("mlc-writer", "MLC writer katalógus", "skipped", "MLC_API_KEY / MLC_PASSWORD hiányzik.");
    }
    if (skip === "synthetic_catalog") {
      return leg(
        "mlc-writer",
        "MLC writer katalógus",
        "skipped",
        "Csak ARTISJUS/CMO sorok — HU filmcímek nem kereshetők MLC-n (CISAC IPI elég).",
      );
    }
    if (skip === "no_titles") {
      return leg("mlc-writer", "MLC writer katalógus", "skipped", "Nincs cím az audit sorokban.");
    }
    if (skip === "no_writer") {
      return leg("mlc-writer", "MLC writer katalógus", "skipped", "Nincs writer név variáns (adj meg előadónevet).");
    }
    if (lookups === 0 && matched === 0 && filled === 0 && titlesQueried === 0) {
      if (meta.catalogEnrichProfile === "composer") {
        return leg(
          "mlc-writer",
          "MLC writer katalógus",
          "skipped",
          "Csak ARTISJUS/CMO sorok — HU filmcímek nem kereshetők MLC-n (CISAC IPI elég).",
        );
      }
      return leg(
        "mlc-writer",
        "MLC writer katalógus",
        "warn",
        "Nem futott — indítsd újra az auditot (frissítés után).",
      );
    }
    if (filled > 0) {
      return leg(
        "mlc-writer",
        "MLC writer katalógus",
        "done",
        `${lookups} keresés · ${matched} cím · +${filled} ISWC`,
      );
    }
    const hybridHint =
      meta.catalogEnrichProfile === "hybrid"
        ? " · vegyes katalógus: csak valódi ISRC sorok"
        : "";
    return leg(
      "mlc-writer",
      "MLC writer katalógus",
      lookups > 0 ? "warn" : "skipped",
      lookups > 0
        ? `${lookups} keresés · ${titlesQueried} cím · 0 illesztés${hybridHint}`
        : "Nincs writer név / IPI",
    );
  })();

  const cisacLeg = (() => {
    const discoveredIpi = meta.catalogEnrichMlcDiscoveredIpi?.trim();
    if (!cisacIpi && discoveredIpi) {
      return leg(
        "cisac",
        "CISAC API (élő)",
        "warn",
        `MLC-ből IPI ${discoveredIpi} — mentsd el az identity wizardban, majd futtasd újra az auditot.`,
      );
    }
    if (!cisacIpi) {
      return leg(
        "cisac",
        "CISAC API (élő)",
        "skipped",
        "Nincs IPI — identity wizard: jogi név + IPI (pl. MLC portal Writer tab).",
      );
    }
    if (cisacCatalog === 0 && cisacFilled === 0 && cisacTitleLookups === 0) {
      return leg(
        "cisac",
        "CISAC API (élő)",
        "warn",
        `IPI ${cisacIpi} — CISAC szerver hiba vagy 0 mű (API időnként 500-at dob, próbáld újra).`,
      );
    }
    const parts: string[] = [];
    if (cisacCatalog > 0) parts.push(`${cisacCatalog} mű IPI alatt`);
    if (cisacTitleLookups > 0) {
      parts.push(`${cisacTitleLookups} cím keresés${legalNameUsed ? "" : " (jogi név nélkül)"}`);
    }
    if (cisacFilled > 0) parts.push(`+${cisacFilled} ISWC`);
    else if (cisacCatalog > 0 || cisacTitleLookups > 0) {
      parts.push("0 ISWC illesztés (HU/EN cím eltérés — sidecar vagy manuális)");
    }
    return leg("cisac", "CISAC API (élő)", cisacFilled > 0 ? "done" : "warn", parts.join(" · "));
  })();

  const iswcNetLeg = (() => {
    if (iswcNet > 0) {
      return leg("iswc-net", "Helyi ISWC map", "done", `+${iswcNet} ISWC · data/artists/{slug}/iswc_net.json`);
    }
    if (!meta.identitySlug && meta.catalogEnrichIswcNetAttempted !== true) {
      return leg(
        "iswc-net",
        "Helyi ISWC map",
        "skipped",
        "Nincs sidecar — HU cím → ISWC párosítás kézzel (nem a CISAC API).",
      );
    }
    return leg(
      "iswc-net",
      "Helyi ISWC map",
      "warn",
      "Sidecar betöltve — 0 találat (magyar címekhez add hozzá a map-et).",
    );
  })();

  return [spotifyLeg, creditsLeg, mlcLeg, mlcWriterLeg, cisacLeg, iswcNetLeg];
}

export function enrichStatusHeadline(
  meta: ArtistAuditMeta | null | undefined,
  enrichBusy: boolean,
  enrichElapsedMs = 0,
): string {
  if (enrichBusy && !meta?.catalogEnrichReady) {
    const profile = meta?.catalogEnrichProfile;
    if (profile === "composer") {
      return "Metaadat scan fut… (zeneszerző katalógus: ~30–60 mp)";
    }
    if (profile === "hybrid") {
      return "Metaadat scan fut… (vegyes: film + felvételek)";
    }
    if (enrichElapsedMs >= 30_000) {
      return "Metaadat scan fut… (előadói ISRC-k: 1–2 perc)";
    }
    return "Metaadat scan fut…";
  }
  if (meta?.catalogEnrichSkipReason === "no_isrc") return "Metaadat scan kihagyva";
  if (meta?.catalogEnrichReady) return "Metaadat scan kész";
  return "Metaadat scan";
}
