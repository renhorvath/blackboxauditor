import {
  EJI_ADATLAP_COLUMNS,
  type EjiAdatlapRow,
} from "@/lib/eji/adatlap-schema";
import {
  discogsConfigured,
  discogsLookupKey,
  enrichTracksWithDiscogs,
  type DiscogsEnrichment,
} from "@/lib/eji/discogs";
import { enrichIsrcsWithMb, type MbRecordingEnrichment } from "@/lib/eji/musicbrainz";
import { expandArtistNameVariants } from "@/lib/eji/artist-variants";
import { buildNeighbouringActSearch } from "@/lib/demo/build-neighbouring-act";
import { searchEjiByArtist } from "@/lib/cmo-web/eji-search";
import type { EjiSearchResult } from "@/lib/cmo-web/eji-types";
import {
  fetchSpotifyArtistById,
  fetchSpotifyArtistTopTracks,
  hydrateSpotifyAlbumMeta,
  searchSpotifyArtists,
  searchSpotifyTracks,
} from "@/lib/spotify";
import { parseSpotifyArtistRef } from "@/lib/spotify-resolve";
import type { SearchTrackHit } from "@/lib/types";
import { readFile } from "node:fs/promises";
import path from "node:path";

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\w\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

async function loadPilotSablonRows(
  query: string,
): Promise<Map<string, { album: string; label: string; year: string; isrc: string; mainArtist: string }>> {
  const map = new Map<
    string,
    { album: string; label: string; year: string; isrc: string; mainArtist: string }
  >();
  const q = fold(query);
  const file =
    q === "snyl"
      ? path.join(process.cwd(), "data/snyl_eji_adatlap_sablon_rows.csv")
      : null;
  if (!file) return map;
  try {
    const raw = await readFile(file, "utf8");
    const lines = raw.trim().split(/\r?\n/);
    const header = lines[0].split(",");
    // naive CSV — titles may be quoted; use simple parse for known file
    for (const line of lines.slice(1)) {
      const cols: string[] = [];
      let cur = "";
      let inQ = false;
      for (const ch of line) {
        if (ch === '"') {
          inQ = !inQ;
          continue;
        }
        if (ch === "," && !inQ) {
          cols.push(cur);
          cur = "";
          continue;
        }
        cur += ch;
      }
      cols.push(cur);
      const title = cols[0] || "";
      if (!title) continue;
      map.set(fold(title), {
        album: cols[1] || "",
        mainArtist: cols[2] || "",
        label: cols[9] || "",
        year: cols[10] || "",
        isrc: (cols[11] || "").toUpperCase(),
      });
    }
    void header;
  } catch {
    /* optional */
  }
  return map;
}

async function searchCatalogForArtist(
  artistName: string,
  spotifyArtistId: string | null,
): Promise<{
  tracks: SearchTrackHit[];
  albumsScanned: number;
}> {
  const searched = await searchSpotifyTracks(artistName, 50);
  if (!spotifyArtistId) {
    return { tracks: searched, albumsScanned: 0 };
  }
  const top = await fetchSpotifyArtistTopTracks(spotifyArtistId, 20).catch(
    () => [] as SearchTrackHit[],
  );
  const byId = new Map<string, SearchTrackHit>();
  for (const t of [...top, ...searched]) byId.set(t.spotifyId, t);
  return { tracks: [...byId.values()], albumsScanned: 0 };
}

function matchSpotifyToEjiTitle(
  ejiTitle: string,
  catalog: SearchTrackHit[],
): SearchTrackHit | null {
  const et = fold(ejiTitle);
  if (!et) return null;
  // Strip (LIVE)/(CLEAN)/feat noise for matching
  const etCore = et
    .replace(/\b(live|clean|radio edit|remix|acoustic)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  let best: SearchTrackHit | null = null;
  let bestScore = 0;
  for (const t of catalog) {
    const st = fold(t.title);
    if (!st) continue;
    const stCore = st
      .replace(/\b(live|clean|radio edit|remix|acoustic)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    let score = 0;
    if (st === et || stCore === etCore) score = 100;
    else if (st.includes(et) || et.includes(st) || stCore.includes(etCore) || etCore.includes(stCore))
      score = 80;
    else {
      const a = new Set(etCore.split(" ").filter((x) => x.length >= 3));
      const b = new Set(stCore.split(" ").filter((x) => x.length >= 3));
      const inter = [...a].filter((x) => b.has(x)).length;
      score = inter * 15;
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 45 ? best : null;
}

function splitArtistCredits(mainArtist: string): string[] {
  return mainArtist
    .split(/,|;|\/|&| feat\.? | ft\.? | with /i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function artistMentioned(artists: string[], needle: string): boolean {
  const n = fold(needle);
  if (!n) return false;
  return artists.some((a) => {
    const f = fold(a);
    return f === n || f.includes(n) || n.includes(f);
  });
}

/**
 * EJI címek amik nincsenek a top/search katalógusban (feat/collab):
 * célzott Spotify keresés cím + co-előadó / query.
 */
async function enrichUnmatchedEjiWithSpotify(
  ejiHits: { title: string; mainArtist: string }[],
  catalog: SearchTrackHit[],
  query: string,
  maxLookups = 15,
): Promise<SearchTrackHit[]> {
  const extras: SearchTrackHit[] = [];
  const seen = new Set(catalog.map((t) => t.spotifyId));
  let n = 0;

  for (const hit of ejiHits) {
    if (n >= maxLookups) break;
    const title = decodeHtml(hit.title);
    if (matchSpotifyToEjiTitle(title, [...catalog, ...extras])) continue;

    const credits = splitArtistCredits(decodeHtml(hit.mainArtist));
    const co =
      credits.find((c) => fold(c) !== fold(query) && fold(c).length >= 2) || "";
    const searches = [
      co ? `${title} ${co}` : null,
      `${title} ${query}`,
      co ? `${co} ${title}` : null,
    ].filter((s): s is string => Boolean(s));

    for (const q of searches) {
      if (n >= maxLookups) break;
      n += 1;
      const hits = await searchSpotifyTracks(q, 10).catch(() => [] as SearchTrackHit[]);
      const relevant = hits.filter(
        (t) =>
          artistMentioned(t.artists, query) ||
          (co ? artistMentioned(t.artists, co) : false),
      );
      const pool = relevant.length ? relevant : hits;
      const best = matchSpotifyToEjiTitle(title, pool);
      if (best && !seen.has(best.spotifyId)) {
        seen.add(best.spotifyId);
        extras.push(best);
        break;
      }
    }
  }

  if (!extras.length) return [];
  return hydrateSpotifyAlbumMeta(extras).catch(() => extras);
}

/** HU vs külföldi sáv — ISRC / kiadó / ékezet, nem fix whitelist. */
function inferHungarianAct(opts: {
  query: string;
  ejiPublishers: string[];
  isrcs: string[];
  labels: string[];
}): { isHu: boolean; reason: string } {
  const isrcs = opts.isrcs
    .map((i) => i.replace(/[^A-Za-z0-9]/g, "").toUpperCase())
    .filter((i) => i.length >= 2);
  const huIsrc = isrcs.filter((i) => i.startsWith("HU")).length;
  const foreignIsrc = isrcs.filter((i) => !i.startsWith("HU")).length;

  if (huIsrc > 0 && huIsrc >= foreignIsrc) {
    return { isHu: true, reason: `ISRC HU (${huIsrc}/${isrcs.length})` };
  }
  if (huIsrc > 0) {
    return { isHu: true, reason: `ISRC HU jelen (${huIsrc})` };
  }

  if (/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(opts.query)) {
    return { isHu: true, reason: "magyar ékezet a névben" };
  }

  const pubBlob = [...opts.ejiPublishers, ...opts.labels].join(" ").toLowerCase();
  if (
    /\b(kft\.?|zrt\.?|bt\.?|hungary|magyar|budapest|gold record|supermanagement|tom-tom|cls\s*music|universal music hungary)\b/i.test(
      pubBlob,
    )
  ) {
    return { isHu: true, reason: "HU kiadó / EJI publisher jel" };
  }

  if (foreignIsrc >= 3 && huIsrc === 0) {
    return { isHu: false, reason: `külföldi ISRC többség (${foreignIsrc})` };
  }

  // EJI.hu-n van track találat, de nincs erős jel → default A (HU recovery PoC)
  return { isHu: true, reason: "default HU (EJI jogosultkutatás kontextus)" };
}

function looksClassical(title: string, mainArtist: string): boolean {
  const blob = `${title} ${mainArtist}`.toLowerCase();
  return /\b(symphony|concerto|sonata|quartet|op\.|rv\s*\d|bwv|verseny|szimfón|karmester|orchestra|philharmon|concert)\b/i.test(
    blob,
  );
}

function recomputeRowFill(r: EjiAdatlapRow) {
  r._meta.missingRequired = [];
  if (!r.title.trim()) r._meta.missingRequired.push("title");
  if (!r.mainArtist.trim()) r._meta.missingRequired.push("mainArtist");
  if (!r.label.trim()) r._meta.missingRequired.push("label");
  if (!r.releaseYear.trim()) r._meta.missingRequired.push("releaseYear");
  if (r.isrc && r.label && r.releaseYear && r.mainArtist) {
    r._meta.fillConfidence = "high";
  } else if ((r.isrc || r.label) && r.mainArtist) {
    r._meta.fillConfidence = "medium";
  } else {
    r._meta.fillConfidence = "low";
  }
}

export type EjiSubmitterRoleHint =
  | ""
  | "szolista"
  | "zenekari_tag"
  | "hangszeres"
  | "enekes"
  | "karmester"
  | "session";

function roleFromHint(
  hint: EjiSubmitterRoleHint | undefined,
): { role: string; instrumental: string; vocal: string; conductor: string } {
  switch (hint) {
    case "szolista":
      return { role: "szólista", instrumental: "", vocal: "", conductor: "" };
    case "zenekari_tag":
      return {
        role: "zenekari tag",
        instrumental: "",
        vocal: "",
        conductor: "",
      };
    case "hangszeres":
      return { role: "", instrumental: "X", vocal: "", conductor: "" };
    case "enekes":
      return { role: "", instrumental: "", vocal: "X", conductor: "" };
    case "karmester":
      return { role: "szólista", instrumental: "", vocal: "", conductor: "X" };
    case "session":
    case "":
    default:
      return { role: "", instrumental: "", vocal: "", conductor: "" };
  }
}

function withComposerPrefix(title: string, composers: string[]): string {
  const t = title.trim();
  if (!t || !composers.length) return t;
  const c = composers[0].trim();
  if (!c) return t;
  const foldT = fold(t);
  const foldC = fold(c);
  if (foldT.startsWith(foldC) || foldT.includes(`${foldC}:`)) return t;
  return `${c}: ${t}`;
}

function buildRow(opts: {
  title: string;
  album: string;
  mainArtist: string;
  submitter: string;
  label: string;
  year: string;
  isrc: string;
  mb?: MbRecordingEnrichment | null;
  discogs?: DiscogsEnrichment | null;
  ejiTrackId?: string;
  spotifyId?: string;
  sources: string[];
  laneHint: "A" | "B" | "C" | null;
  notes?: string[];
  roleHint?: EjiSubmitterRoleHint;
}): EjiAdatlapRow {
  const dgCredits = [
    ...(opts.discogs?.artistCredits ?? []),
    ...(opts.discogs?.extraArtists ?? []),
  ];
  const credits = opts.mb?.artistCredits?.length
    ? opts.mb.artistCredits
    : dgCredits.length
      ? [...new Set(dgCredits)]
      : opts.mainArtist
          .split(/,| feat\.? | ft\.? | & /i)
          .map((s) => s.trim())
          .filter(Boolean);

  const mainArtist =
    opts.mb?.isClassicalSuspect && opts.mb.conductorNames.length
      ? [...new Set([...credits, ...opts.mb.conductorNames])].join(", ")
      : opts.mainArtist || credits.join(", ");

  const composers = [
    ...new Set([
      ...(opts.mb?.composerNames ?? []),
      ...(opts.discogs?.composers ?? []),
    ]),
  ];
  const classical =
    Boolean(opts.mb?.isClassicalSuspect) ||
    composers.length > 0 ||
    looksClassical(opts.title, mainArtist);

  let title = opts.title;
  if (classical && composers.length) {
    title = withComposerPrefix(title, composers);
  }

  const roles = roleFromHint(opts.roleHint);
  const conductor = roles.conductor;
  const submitterRole = roles.role;
  const instrumental = roles.instrumental;
  const vocal = roles.vocal;
  let bandCount = credits.length > 1 ? String(credits.length) : "";

  if (opts.mb?.isClassicalSuspect) {
    if (opts.mb.creditCount >= 5) {
      bandCount = String(Math.max(opts.mb.creditCount, 10));
    }
  }

  const label = opts.label || opts.mb?.label || opts.discogs?.label || "";
  const year = opts.year || opts.mb?.releaseYear || opts.discogs?.releaseYear || "";
  const isrc = opts.isrc || "";

  const missingRequired: string[] = [];
  if (!title.trim()) missingRequired.push("title");
  if (!mainArtist.trim()) missingRequired.push("mainArtist");
  if (!label.trim()) missingRequired.push("label");
  if (!year.trim()) missingRequired.push("releaseYear");

  const notes = [...(opts.notes || [])];
  if (classical) {
    notes.push(
      composers.length
        ? "Komolyzene: szerző a cím elején (EJI)."
        : "Komolyzene-gyanú: ellenőrizd, hogy a szerző a cím elején van-e.",
    );
    notes.push("Komolyzene: tételenként külön sor kell (EJI PDF).");
  }
  if (credits.length > 2) {
    notes.push(
      `Több előadó (${credits.length}): ellenőrizd a főmezőt és a szerepet.`,
    );
  }
  if (opts.roleHint && opts.roleHint !== "session") {
    notes.push("Szerep: előzetes tipp a választott nyilatkozat alapján — ellenőrizd.");
  } else {
    notes.push("Szerep / közreműködés: kézi kitöltés (vagy válassz tippet felül).");
  }

  const provenance: "eji" | "catalog" | "assumed" = opts.sources.includes("eji")
    ? "eji"
    : opts.sources.includes("spotify")
      ? "catalog"
      : "assumed";

  let fillConfidence: "high" | "medium" | "low" = "low";
  if (isrc && label && year && mainArtist) fillConfidence = "high";
  else if ((isrc || label) && mainArtist) fillConfidence = "medium";

  return {
    title,
    album: opts.album,
    mainArtist,
    submitterRole,
    bandMembersCount: bandCount,
    contribConductor: conductor,
    contribInstrumental: instrumental,
    contribVocal: vocal,
    contribNarrator: "",
    label,
    releaseYear: year,
    isrc,
    _meta: {
      ejiTrackId: opts.ejiTrackId,
      spotifyId: opts.spotifyId,
      musicbrainzRecordingId: opts.mb?.recordingId,
      discogsReleaseId: opts.discogs?.releaseId,
      sources: opts.sources,
      missingRequired,
      fillConfidence,
      notes,
      laneHint: opts.laneHint,
      artistCredits: credits,
      isClassicalSuspect: classical,
      provenance,
    },
  };
}

export type EjiPocSpotifyCandidate = {
  id: string;
  name: string;
  followers: number | null;
  genres: string[];
  /** HU ISRC a top trackekből (ha mérve) */
  huIsrcCount: number | null;
  exactName: boolean;
  /** Link / ID alapján rögzítve */
  locked?: boolean;
};

export type EjiPocBundle = {
  query: string;
  submitter: string;
  spotifyArtist: { id: string; name: string } | null;
  /** Explicit link/ID vagy UI választás — ne írja felül a heurisztika */
  spotifyArtistLocked: boolean;
  /** Többértelmű név — UI választó */
  spotifyCandidates: EjiPocSpotifyCandidate[];
  spotifyAmbiguous: boolean;
  lanes: {
    A: { label: string; items: { title: string; detail: string }[] };
    B: { label: string; items: { title: string; detail: string; source: string }[] };
    C: { label: string; items: { title: string; detail: string }[] };
  };
  adatlapRows: EjiAdatlapRow[];
  csv: string;
  stats: {
    ejiTracks: number;
    ejiArtists: number;
    /** Adatlap-sorok amik EJI találatból jöttek */
    ejiRows: number;
    /** Spotify/katalógus sorok EJI pár nélkül */
    catalogExtraRows: number;
    /** Összes adatlap-sor (EJI + extra) */
    adatlapTotal: number;
    foreignUp: number;
    templateFillable: number;
    templateNeedsReview: number;
    spotifyTracks: number;
    mbEnriched: number;
    discogsEnriched: number;
    discogsConfigured: boolean;
    laneReason: string;
    isHuLane: boolean;
    /** Ha Spotify kiesett / üres — UI figyelmeztetés */
    spotifyWarning: string | null;
  };
  template: {
    version: string;
    downloadPath: string;
    officialUrl: string;
    classicalGuidePath: string;
  };
};

function toCsv(rows: EjiAdatlapRow[]): string {
  const headers = EJI_ADATLAP_COLUMNS.map((c) => c.header);
  const escape = (v: string) => {
    if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(
      EJI_ADATLAP_COLUMNS.map((c) => escape(row[c.key] ?? "")).join(","),
    );
  }
  return lines.join("\n");
}

const HU_ROSTER_HINT = new Set(
  [
    "snyl",
    "wellhello",
    "halott penz",
    "akos",
    "omega",
    "quimby",
    "beton hofi",
    "bagossy",
    "caramel",
    "stone sober",
  ].map(fold),
);

export async function buildEjiPocBundle(input: {
  query: string;
  submitter?: string;
  spotifyArtistId?: string;
  /** Vessző/pontosvessző: aliasok / másik névsorrend */
  aliases?: string[];
  roleHint?: EjiSubmitterRoleHint;
  enrichMb?: boolean;
  enrichDiscogs?: boolean;
}): Promise<EjiPocBundle> {
  const rawQuery = input.query.trim();
  const spotifyWarnings: string[] = [];
  const roleHint = input.roleHint || "";

  /** Explicit artist: param, query URL/URI, vagy bare ID a queryben */
  let forcedArtistId =
    parseSpotifyArtistRef(input.spotifyArtistId || "") ||
    parseSpotifyArtistRef(rawQuery) ||
    "";

  let lockedArtist: Awaited<ReturnType<typeof fetchSpotifyArtistById>> = null;
  if (forcedArtistId) {
    try {
      lockedArtist = await fetchSpotifyArtistById(forcedArtistId);
      if (!lockedArtist) {
        spotifyWarnings.push("A megadott katalógus-előadó nem található.");
        forcedArtistId = "";
      }
    } catch (e) {
      spotifyWarnings.push(
        e instanceof Error
          ? e.message.replace(/Spotify/gi, "Katalógus")
          : "Katalógus előadó feloldás hiba",
      );
      forcedArtistId = "";
      lockedArtist = null;
    }
  }

  const queryFromLink = Boolean(
    lockedArtist &&
      (parseSpotifyArtistRef(rawQuery) === lockedArtist.spotifyId ||
        !rawQuery ||
        rawQuery.length < 2),
  );
  const query = queryFromLink
    ? lockedArtist!.name
    : rawQuery || lockedArtist?.name || "";
  const submitter = (input.submitter || query).trim();
  const spotifyArtistLocked = Boolean(lockedArtist);
  const queryVariants = expandArtistNameVariants(query, input.aliases || []).slice(
    0,
    4,
  );

  if (query.length < 2) {
    throw new Error("Legalább 2 karakter kell (előadó név vagy katalógus-link).");
  }

  async function mergeEjiSearches(variants: string[]): Promise<EjiSearchResult> {
    const parts = await Promise.all(
      variants.map((v) =>
        searchEjiByArtist(v).catch(
          (): EjiSearchResult => ({
            query: v,
            trackHits: [],
            artistHits: [],
            fetchedAt: new Date().toISOString(),
            fromCache: false,
          }),
        ),
      ),
    );
    const trackById = new Map<string, EjiSearchResult["trackHits"][number]>();
    const artistById = new Map<string, EjiSearchResult["artistHits"][number]>();
    for (const p of parts) {
      for (const t of p.trackHits) trackById.set(t.id, t);
      for (const a of p.artistHits) artistById.set(a.refId || a.name, a);
    }
    return {
      query: variants[0] || query,
      trackHits: [...trackById.values()],
      artistHits: [...artistById.values()],
      fetchedAt: new Date().toISOString(),
      fromCache: parts.some((p) => p.fromCache),
    };
  }

  const [eji, neighbouring, artistsResult] = await Promise.all([
    mergeEjiSearches(queryVariants),
    buildNeighbouringActSearch(query).catch(() => ({
      id: "adhoc",
      name: query,
      kind: "adhoc",
      blurb: "Neighbouring index nem elérhető ezen a deployon.",
      ejiTrackCount: 0,
      ejiArtistCount: 0,
      foreignHitTotal: 0,
      foreignBySource: {},
      pairedRecordingCount: 0,
      strongPairCount: 0,
      reviewPairCount: 0,
      ejiOnlyCount: 0,
      orphanForeignCount: 0,
      ejiArtists: [],
      recordings: [],
      orphanForeign: [],
    })),
    searchSpotifyArtists(query, 5)
      .then((a) => ({ artists: a, error: null as string | null }))
      .catch((e) => ({
        artists: [] as Awaited<ReturnType<typeof searchSpotifyArtists>>,
        error: e instanceof Error
          ? e.message.replace(/Spotify/gi, "Katalógus")
          : "Előadó keresés hiba",
      })),
  ]);

  let artists = artistsResult.artists;
  if (artistsResult.error) spotifyWarnings.push(artistsResult.error);

  // Rögzített előadó mindig a lista élén
  if (lockedArtist) {
    artists = [
      lockedArtist,
      ...artists.filter((a) => a.spotifyId !== lockedArtist!.spotifyId),
    ];
  }

  // ASCII fallback (dzsudlo), ha ékezetes query üres listát ad
  if (!artists.length && /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(query)) {
    const ascii = fold(query);
    if (ascii.length >= 2) {
      try {
        artists = await searchSpotifyArtists(ascii, 5);
      } catch (e) {
        spotifyWarnings.push(
          e instanceof Error
            ? e.message.replace(/Spotify/gi, "Katalógus")
            : "Előadó keresés hiba",
        );
      }
    }
  }

  // Bővebb lista a választóhoz (locked nélkül is)
  if (!lockedArtist && artists.length && artists.length < 8) {
    try {
      const more = await searchSpotifyArtists(query, 10);
      const byId = new Map(artists.map((a) => [a.spotifyId, a]));
      for (const a of more) byId.set(a.spotifyId, a);
      artists = [...byId.values()];
    } catch {
      /* keep */
    }
  }

  const exactNameArtists = artists.filter((a) => fold(a.name) === fold(query));
  /** Csak név-releváns jelöltek — ne jöjjön Tankcsapda/Quimby „related” zaj. */
  const relevantArtists = artists.filter((a) => {
    if (lockedArtist && a.spotifyId === lockedArtist.spotifyId) return true;
    const nt = fold(a.name).split(/\s+/).filter(Boolean);
    const qt = fold(query).split(/\s+/).filter(Boolean);
    if (!qt.length) return false;
    if (fold(a.name) === fold(query)) return true;
    return qt.every((t) => nt.includes(t));
  });
  const candidatePool =
    relevantArtists.length > 0
      ? relevantArtists
      : lockedArtist
        ? [lockedArtist]
        : exactNameArtists;
  const spotifyAmbiguous =
    !spotifyArtistLocked &&
    (candidatePool.filter((a) => fold(a.name) === fold(query)).length > 1 ||
      (candidatePool.length > 1 && exactNameArtists.length === 0));

  /** HU ISRC hint a legfontosabb jelöltekre (max 3) */
  const huHintIds = (
    lockedArtist
      ? [lockedArtist]
      : exactNameArtists.length > 1
        ? exactNameArtists
        : candidatePool
  ).slice(0, 3);
  const huHintMap = new Map<string, number>();
  for (const a of huHintIds) {
    try {
      const top = await fetchSpotifyArtistTopTracks(a.spotifyId, 8);
      const hyd = await hydrateSpotifyAlbumMeta(top).catch(() => top);
      const hu = hyd.filter((t) =>
        (t.isrc || "").toUpperCase().startsWith("HU"),
      ).length;
      huHintMap.set(a.spotifyId, hu);
    } catch {
      huHintMap.set(a.spotifyId, 0);
    }
  }

  const spotifyCandidates: EjiPocSpotifyCandidate[] = candidatePool
    .slice(0, 8)
    .map((a) => ({
      id: a.spotifyId,
      name: a.name,
      followers: a.followers ?? null,
      genres: a.genres ?? [],
      huIsrcCount: huHintMap.has(a.spotifyId)
        ? (huHintMap.get(a.spotifyId) ?? null)
        : null,
      exactName: fold(a.name) === fold(query),
      locked: Boolean(lockedArtist && a.spotifyId === lockedArtist.spotifyId),
    }));

  function pickArtist(): { id: string; name: string } | null {
    if (lockedArtist) {
      return { id: lockedArtist.spotifyId, name: lockedArtist.name };
    }
    if (input.spotifyArtistId) {
      const forced =
        artists.find((a) => a.spotifyId === input.spotifyArtistId) ||
        spotifyCandidates.find((a) => a.id === input.spotifyArtistId);
      if (forced) {
        return {
          id: "spotifyId" in forced ? forced.spotifyId : forced.id,
          name: forced.name,
        };
      }
      return { id: input.spotifyArtistId, name: query };
    }
    const pool =
      exactNameArtists.length > 0
        ? exactNameArtists
        : candidatePool.slice(0, 5);
    if (!pool.length) return null;
    // Prefer HU ISRC signal among exact / top candidates
    let best = pool[0];
    let bestScore = -1;
    for (const a of pool) {
      const hu = huHintMap.get(a.spotifyId) ?? 0;
      const exact = fold(a.name) === fold(query) ? 10 : 0;
      const score = hu * 5 + exact + Math.min(a.followers ?? 0, 50_000) / 50_000;
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return { id: best.spotifyId, name: best.name };
  }

  const spotifyArtist = pickArtist();

  if (!spotifyArtist) {
    spotifyWarnings.push(
      "Nincs katalógus-előadó — év/kiadó/ISRC pótlás gyenge lesz. Próbáld újra.",
    );
  }

  let catalogRaw: { tracks: SearchTrackHit[]; albumsScanned: number };
  try {
    catalogRaw = await searchCatalogForArtist(
      spotifyArtist?.name || query,
      spotifyArtist?.id ?? null,
    );
  } catch (e) {
    spotifyWarnings.push(
      e instanceof Error ? e.message.replace(/Spotify/gi, "Katalógus") : "Katalógus hiba",
    );
    catalogRaw = { tracks: [], albumsScanned: 0 };
  }

  let catalogTracks = await hydrateSpotifyAlbumMeta(catalogRaw.tracks).catch(
    () => catalogRaw.tracks,
  );

  // Feat/collab: mindig futtatjuk az EJI címekre (üres katalógusnál is)
  const collabExtras = await enrichUnmatchedEjiWithSpotify(
    eji.trackHits.slice(0, 40).map((h) => ({
      title: h.title,
      mainArtist: h.mainArtist,
    })),
    catalogTracks,
    query,
    catalogTracks.length < 10 ? 25 : 15,
  );
  if (collabExtras.length) {
    const byId = new Map(catalogTracks.map((t) => [t.spotifyId, t]));
    for (const t of collabExtras) byId.set(t.spotifyId, t);
    catalogTracks = [...byId.values()];
  }

  if (!catalogTracks.length && eji.trackHits.length) {
    spotifyWarnings.push(
      "Katalógus üres — az EJI sorokhoz nincs automatikus év/kiadó. Próbáld újra.",
    );
  }

  const catalog = {
    tracks: catalogTracks,
    albumsScanned: catalogRaw.albumsScanned,
  };

  const pilot = await loadPilotSablonRows(query);

  // MusicBrainz: nem előre mindenhova — csak később, ha kell
  const mbMap = new Map<string, MbRecordingEnrichment>();

  // Lane: heurisztika (ISRC/kiadó/ékezet), whitelist csak soft boost
  const laneInfer = inferHungarianAct({
    query,
    ejiPublishers: eji.trackHits.map((h) => h.publisher || ""),
    isrcs: catalog.tracks.map((t) => t.isrc || "").filter(Boolean),
    labels: catalog.tracks.map((t) => t.label || "").filter(Boolean),
  });
  const rosterBoost =
    HU_ROSTER_HINT.has(fold(query)) || HU_ROSTER_HINT.has(fold(submitter));
  const isHuLane = rosterBoost ? true : laneInfer.isHu;
  const laneReason = rosterBoost
    ? `HU roster hint + ${laneInfer.reason}`
    : laneInfer.reason;

  const rows: EjiAdatlapRow[] = [];
  const usedSpotify = new Set<string>();

  // Seed from EJI tracks — primary for A/C
  for (const hit of eji.trackHits.slice(0, 80)) {
    const title = decodeHtml(hit.title);
    const mainArtist = decodeHtml(hit.mainArtist);
    const sp = matchSpotifyToEjiTitle(title, catalog.tracks);
    const prior = pilot.get(fold(title));

    if (sp?.spotifyId) usedSpotify.add(sp.spotifyId);
    const isrc = sp?.isrc || prior?.isrc || "";

    const ejiLabel =
      hit.publisher && !/szerz/i.test(fold(hit.publisher)) ? hit.publisher : "";

    // Priority: Spotify → pilot sablon → EJI (MB később, ha kell)
    rows.push(
      buildRow({
        title,
        album: sp?.album || prior?.album || hit.album || "",
        mainArtist:
          sp?.artists.join(", ") || prior?.mainArtist || mainArtist || query,
        submitter,
        label: sp?.label || prior?.label || ejiLabel || "",
        year:
          sp?.releaseYear ||
          prior?.year ||
          (hit.publicationYear ? String(hit.publicationYear) : "") ||
          "",
        isrc,
        ejiTrackId: hit.id,
        spotifyId: sp?.spotifyId,
        sources: [
          "eji",
          ...(sp ? ["spotify"] : []),
          ...(prior && !sp ? ["pilot-sablon"] : []),
        ],
        laneHint: isHuLane ? "A" : "C",
        roleHint,
        notes: sp
          ? [
              `Katalógus: ${sp.title}`,
              ...(sp.releaseYear ? [`Év: ${sp.releaseYear}`] : []),
              ...(sp.label ? [`Kiadó: ${sp.label}`] : []),
            ]
          : prior
            ? ["Nincs katalógus pár — pilot / EJI adat"]
            : ["Nincs katalógus pár — label/ISRC kézi"],
      }),
    );
  }

  // Katalógus-only tracks not in EJI → still useful for template (new registrations)
  for (const t of catalog.tracks.slice(0, 40)) {
    if (usedSpotify.has(t.spotifyId)) continue;
    const isrc = t.isrc || "";
    // skip if title already in rows
    const folded = fold(t.title);
    if (rows.some((r) => fold(r.title) === folded)) continue;

    rows.push(
      buildRow({
        title: t.title,
        album: t.album || "",
        mainArtist: t.artists.join(", ") || query,
        submitter,
        label: t.label || "",
        year: t.releaseYear || "",
        isrc,
        spotifyId: t.spotifyId,
        sources: ["spotify"],
        laneHint: isHuLane ? "A" : "C",
        roleHint,
        notes: [
          "Csak katalógus — EJI-ben még nincs / nem egyezett",
          ...(t.releaseYear ? [`Év: ${t.releaseYear}`] : []),
          ...(t.label ? [`Kiadó: ${t.label}`] : []),
        ],
      }),
    );
  }

  // Discogs: pótolja a hiányzó kiadót / évet (és opcionálisan creditet)
  let discogsMap = new Map<string, DiscogsEnrichment>();
  const useDiscogs =
    input.enrichDiscogs !== false && discogsConfigured();
  if (useDiscogs) {
    const needDg = rows
      .filter((r) => !r.label || !r.releaseYear)
      .slice(0, 12)
      .map((r) => ({
        artist:
          splitArtistCredits(r.mainArtist).find(
            (c) => fold(c) !== fold(query),
          ) ||
          splitArtistCredits(r.mainArtist)[0] ||
          query,
        title: r.title,
        needCredits: !r._meta.artistCredits || r._meta.artistCredits.length < 2,
      }));
    discogsMap = await enrichTracksWithDiscogs(needDg, 12);

    for (const r of rows) {
      if (r.label && r.releaseYear) continue;
      const credits = splitArtistCredits(r.mainArtist);
      const keys = [
        ...credits.map((c) => discogsLookupKey(c, r.title)),
        discogsLookupKey(query, r.title),
      ];
      const dg = keys.map((k) => discogsMap.get(k)).find(Boolean);
      if (!dg) continue;

      if (!r.label && dg.label) r.label = dg.label;
      if (!r.releaseYear && dg.releaseYear) r.releaseYear = dg.releaseYear;
      if (dg.releaseId) r._meta.discogsReleaseId = dg.releaseId;
      if (!r._meta.sources.includes("discogs")) {
        r._meta.sources.push("discogs");
      }
      if (dg.label) r._meta.notes.push(`Kiadó (meta): ${dg.label}`);
      if (dg.releaseYear) r._meta.notes.push(`Év (meta): ${dg.releaseYear}`);

      const dgCredits = [
        ...dg.artistCredits,
        ...dg.extraArtists,
      ].filter(Boolean);
      if (dgCredits.length && (!r._meta.artistCredits || r._meta.artistCredits.length < 2)) {
        r._meta.artistCredits = [...new Set(dgCredits)];
      }

      recomputeRowFill(r);
    }
  }

  // MusicBrainz csak ahol még hiányzik label/év, vagy classical gyanú (+ ISRC)
  if (input.enrichMb !== false) {
    const needMbIsrcs = [
      ...new Set(
        rows
          .filter(
            (r) =>
              Boolean(r.isrc) &&
              ((!r.label || !r.releaseYear) ||
                looksClassical(r.title, r.mainArtist)),
          )
          .map((r) => r.isrc.replace(/[^A-Za-z0-9]/g, "").toUpperCase())
          .filter((i) => i.length >= 12),
      ),
    ].slice(0, 8);

    if (needMbIsrcs.length) {
      const found = await enrichIsrcsWithMb(needMbIsrcs, 8);
      for (const [isrc, mb] of found) mbMap.set(isrc, mb);

      for (const r of rows) {
        const key = r.isrc.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
        const mb = key ? mbMap.get(key) : undefined;
        if (!mb) continue;
        let touched = false;
        if (!r.label && mb.label) {
          r.label = mb.label;
          touched = true;
        }
        if (!r.releaseYear && mb.releaseYear) {
          r.releaseYear = mb.releaseYear;
          touched = true;
        }
        if (mb.artistCredits.length > (r._meta.artistCredits?.length ?? 0)) {
          r._meta.artistCredits = mb.artistCredits;
          touched = true;
        }
        if (mb.isClassicalSuspect) {
          r._meta.isClassicalSuspect = true;
          r._meta.notes.push("Komolyzene-gyanú — ellenőrizd a tételeket");
          touched = true;
        }
        if (mb.composerNames?.length) {
          const next = withComposerPrefix(r.title, mb.composerNames);
          if (next !== r.title) {
            r.title = next;
            r._meta.notes.push("Szerző a cím elején (MB).");
            touched = true;
          }
        }
        if (touched) {
          r._meta.musicbrainzRecordingId = mb.recordingId;
          if (!r._meta.sources.includes("musicbrainz")) {
            r._meta.sources.push("musicbrainz");
          }
          recomputeRowFill(r);
        }
      }
    }
  }

  for (const r of rows) {
    if (!r.label) {
      r._meta.notes.push(
        useDiscogs
          ? "Kiadó hiányzik — meta pótlás sem talált"
          : "Kiadó hiányzik — kézi pótlás kell",
      );
    }
  }

  const laneAItems = rows
    .filter((r) => r._meta.laneHint === "A")
    .slice(0, 30)
    .map((r) => ({
      title: r.title,
      detail: [r.isrc, r.label, r.releaseYear].filter(Boolean).join(" · "),
    }));

  type LaneItem = { title: string; detail: string };
  /** C = külföldi előadó EJI jogosultkutatás / függő — NEM HU artist-tab. */
  const laneCLabel =
    "Külföldi @ EJI (függő / jogosultkutatás — ugyanaz a mechanika, mint a magyar függő)";
  const laneCItems: LaneItem[] = !isHuLane
    ? eji.trackHits.slice(0, 25).map((h) => ({
        title: decodeHtml(h.title),
        detail: `EJI id ${h.id} · ${decodeHtml(h.mainArtist)}`,
      }))
    : [];

  const laneB = {
    label: "Magyar @ külföldi neighbouring UP (repatriáció)",
    items: [
      ...neighbouring.recordings
        .filter((r) => r.foreignPairs.length)
        .flatMap((r) =>
          r.foreignPairs.map((p) => ({
            title: r.title,
            detail: `${p.label}: ${p.title}${p.isrc ? ` · ${p.isrc}` : ""}`,
            source: p.label,
          })),
        ),
      ...neighbouring.orphanForeign.map((o) => ({
        title: o.title,
        detail: `${o.label}: ${o.performer} — ${o.matchNote}`,
        source: o.label,
      })),
    ].slice(0, 40),
  };

  const fillable = rows.filter((r) => r._meta.missingRequired.length === 0).length;
  const ejiRows = rows.filter((r) => r._meta.sources.includes("eji")).length;
  const catalogExtraRows = rows.filter(
    (r) => !r._meta.sources.includes("eji"),
  ).length;

  return {
    query,
    submitter,
    spotifyArtist,
    spotifyArtistLocked,
    spotifyCandidates,
    spotifyAmbiguous,
    lanes: {
      A: {
        label: "Magyar @ EJI (felvétel / adatlap-jelölt)",
        items: isHuLane ? laneAItems : [],
      },
      B: laneB,
      C: {
        label: laneCLabel,
        items: laneCItems,
      },
    },
    adatlapRows: rows,
    csv: toCsv(rows),
    stats: {
      ejiTracks: eji.trackHits.length,
      ejiArtists: eji.artistHits.length,
      ejiRows,
      catalogExtraRows,
      adatlapTotal: rows.length,
      foreignUp: neighbouring.foreignHitTotal,
      templateFillable: fillable,
      templateNeedsReview: rows.length - fillable,
      spotifyTracks: catalog.tracks.length,
      mbEnriched: mbMap.size,
      discogsEnriched: discogsMap.size,
      discogsConfigured: discogsConfigured(),
      laneReason,
      isHuLane,
      spotifyWarning: spotifyWarnings.length
        ? [...new Set(spotifyWarnings)].join(" · ")
        : null,
    },
    template: {
      version: "v1.111",
      downloadPath: "/api/demo/eji-template",
      officialUrl: "https://eji.hu/download/record/excel/hu",
      classicalGuidePath: "/api/demo/eji-template?kind=classical",
    },
  };
}
