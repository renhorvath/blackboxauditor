/**
 * EJI hangfelvételi adatlap — hivatalos Excel sablon v1.111 mezői.
 * Forrás: https://eji.hu/download/record/excel/hu
 * Űrlap: https://eji.hu/record/hangfelveteli_adatlap/hu/fd/fd
 * Komolyzene: data/eji/templates/hangfelveteli_adatlap_komolyzene.pdf
 */

export const EJI_TEMPLATE_VERSION = "v1.111";
export const EJI_TEMPLATE_DOWNLOAD_URL = "https://eji.hu/download/record/excel/hu";
export const EJI_CLASSICAL_GUIDE_URL =
  "https://www.eji.hu/download/20250821040900_hangfelveteli_adatlap_komolyzene_pdf";

/** Oszlopok a batch Excel sablonban (Hangfelvételi adatok sheet). */
export const EJI_ADATLAP_COLUMNS = [
  { key: "title", header: "Hangfelvétel címe", required: true },
  { key: "album", header: "Az album címe", required: false },
  {
    key: "mainArtist",
    header:
      "Annak az együttesnek és/vagy szólistának a neve, amelynek/akinek a neve alatt a hangfelvétel megjelent",
    required: true,
  },
  {
    key: "submitterRole",
    header:
      "Jelölje itt, ha Ön szólistája volt a felvételnek, vagy a zenekar tagjaként dolgozott a rögzítésen",
    required: false,
    note: "szólista | zenekari tag | üres (pl. stúdiózenész — akkor se szólista, se tag)",
  },
  { key: "bandMembersCount", header: "Zenekar tagjainak száma", required: false },
  { key: "contribConductor", header: "karmester/karvezető", required: false },
  { key: "contribInstrumental", header: "hangszeres zenész", required: false },
  { key: "contribVocal", header: "énekes", required: false },
  { key: "contribNarrator", header: "prózamondó", required: false },
  { key: "label", header: "Kiadó", required: true },
  { key: "releaseYear", header: "Kiadás éve", required: true },
  { key: "isrc", header: "ISRC", required: false },
] as const;

export type EjiAdatlapColumnKey = (typeof EJI_ADATLAP_COLUMNS)[number]["key"];

export type EjiAdatlapRow = Record<EjiAdatlapColumnKey, string> & {
  /** PoC meta — nem megy az EJI sablonba */
  _meta: {
    ejiTrackId?: string;
    spotifyId?: string;
    musicbrainzRecordingId?: string;
    discogsReleaseId?: number;
    sources: string[];
    missingRequired: string[];
    fillConfidence: "high" | "medium" | "low";
    notes: string[];
    laneHint: "A" | "B" | "C" | null;
    artistCredits?: string[];
    isClassicalSuspect?: boolean;
    /** eji = jogosultkutatás találat; catalog = csak katalógus; assumed = egyéb */
    provenance?: "eji" | "catalog" | "assumed";
  };
};

export const EJI_CLASSICAL_RULES = [
  "Komolyzene: a mű egészét és a tételeket külön-külön is fel kell tüntetni.",
  "Szólista + zenekar + karmester neve mind menjen a „együttes/szólista” mezőbe.",
  "A karmester a felvétel szólistája (szólista jelölés + karmester/karvezető X).",
  "Zenekar tagjainak száma = együttes létszám (pl. 50).",
] as const;

export const EJI_MULTI_PERFORMER_RULES = [
  "Ha Ön szólista vagy zenekari tag: jelölje. Stúdiózenész / session: egyiket se.",
  "Több előadó a főmezőben vesszővel / „feat.” — a credit lista segít.",
  "Remix: a megjelenési főelőadó a sablon 3. oszlopa; a submitter szerepe külön.",
] as const;
