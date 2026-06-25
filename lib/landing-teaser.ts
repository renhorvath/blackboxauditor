import type { ArtisjusArtistMatch } from "@/lib/artisjus-types";
import type { CmoArtistMatch, CmoSourceId } from "@/lib/cmo-types";
import type { CmoWebHit, CmoWebSourceId } from "@/lib/cmo-web/web-types";
import type { EjiHit } from "@/lib/cmo-web/eji-types";

/** One hit shown (or blurred) in a source group. */
export interface LandingTeaserHit {
  title: string;
  type?: string;
  year?: number;
}

/** A collecting-society group in the gated teaser. */
export interface LandingTeaserGroup {
  key: string;
  source: string;
  region: string;
  flag: string;
  total: number;
  confidence: "high" | "fuzzy";
  /** Up to 3 sample titles (only for high-confidence groups). */
  hits: LandingTeaserHit[];
}

export interface LandingTeaserResult {
  status: "found" | "none" | "unavailable";
  resolvedName: string;
  groups: LandingTeaserGroup[];
  summary: { totalItems: number; societies: number; countries: number };
}

const MAX_HITS = 3;

const REGION_FLAG: Record<string, string> = {
  Magyarország: "🇭🇺",
  Ausztria: "🇦🇹",
  Hollandia: "🇳🇱",
  Svédország: "🇸🇪",
  Szlovákia: "🇸🇰",
  Románia: "🇷🇴",
  Horvátország: "🇭🇷",
  Észtország: "🇪🇪",
  Csehország: "🇨🇿",
  Finnország: "🇫🇮",
  Németország: "🇩🇪",
  Franciaország: "🇫🇷",
  Lengyelország: "🇵🇱",
  Dánia: "🇩🇰",
  "Egyesült Királyság": "🇬🇧",
  Spanyolország: "🇪🇸",
  USA: "🇺🇸",
};

const CMO_PRESENTATION: Record<CmoSourceId, { source: string; region: string }> = {
  "at-akm": { source: "AKM", region: "Ausztria" },
  "at-aume": { source: "AUME", region: "Ausztria" },
  "nl-sena": { source: "SENA", region: "Hollandia" },
  "se-stim": { source: "STIM", region: "Svédország" },
  "sk-soza": { source: "SOZA", region: "Szlovákia" },
  "ro-credidam": { source: "CREDIDAM", region: "Románia" },
  "hr-hds-zamp": { source: "HDS-ZAMP", region: "Horvátország" },
  "ro-ucmr-ada": { source: "UCMR-ADA", region: "Románia" },
  "ee-eau": { source: "EAÜ", region: "Észtország" },
  "ee-eel": { source: "EEL", region: "Észtország" },
  "cz-intergram": { source: "INTERGRAM", region: "Csehország" },
  "fi-gramex": { source: "Gramex", region: "Finnország" },
  "de-gvl": { source: "GVL", region: "Németország" },
};

const CMO_WEB_PRESENTATION: Record<CmoWebSourceId, { source: string; region: string }> = {
  zaiks: { source: "ZAiKS", region: "Lengyelország" },
  sacem: { source: "SACEM", region: "Franciaország" },
  spedidam: { source: "SPEDIDAM", region: "Franciaország" },
  sami: { source: "SAMI", region: "Svédország" },
  koda: { source: "KODA", region: "Dánia" },
  prs: { source: "PRS", region: "Egyesült Királyság" },
  sgae: { source: "SGAE", region: "Spanyolország" },
  buma: { source: "BUMA/Stemra", region: "Hollandia" },
};

function flagFor(region: string): string {
  return REGION_FLAG[region] ?? "🏳️";
}

export interface BuildLandingTeaserInput {
  resolvedName: string;
  available: boolean;
  artisjusMatches: ArtisjusArtistMatch[];
  cmoMatches: CmoArtistMatch[];
  ejiHits: EjiHit[];
  cmoWebHits: CmoWebHit[];
}

/** Pure aggregation: flat source lists → gated, grouped teaser payload. */
export function buildLandingTeaser(input: BuildLandingTeaserInput): LandingTeaserResult {
  const { resolvedName, available } = input;

  if (!available) {
    return {
      status: "unavailable",
      resolvedName,
      groups: [],
      summary: { totalItems: 0, societies: 0, countries: 0 },
    };
  }

  const groups: LandingTeaserGroup[] = [];

  // ARTISJUS (HU, author) — domestic, high confidence
  if (input.artisjusMatches.length > 0) {
    const sorted = [...input.artisjusMatches].sort((a, b) => b.score - a.score);
    groups.push({
      key: "artisjus",
      source: "ARTISJUS",
      region: "Magyarország",
      flag: flagFor("Magyarország"),
      total: input.artisjusMatches.length,
      confidence: "high",
      hits: sorted.slice(0, MAX_HITS).map((m) => ({ title: m.work.mucim })),
    });
  }

  // EJI (HU, neighbouring) — domestic, high confidence
  if (input.ejiHits.length > 0) {
    const trackTitles = input.ejiHits
      .filter((h): h is Extract<EjiHit, { kind: "track" }> => h.kind === "track")
      .map((h) => ({
        title: h.title,
        year: h.publicationYear ?? undefined,
      }));
    groups.push({
      key: "eji",
      source: "EJI",
      region: "Magyarország",
      flag: flagFor("Magyarország"),
      total: input.ejiHits.length,
      confidence: "high",
      hits: trackTitles.slice(0, MAX_HITS),
    });
  }

  // EU CMO indexes (structured matches) — high confidence
  const cmoBySource = new Map<CmoSourceId, CmoArtistMatch[]>();
  for (const match of input.cmoMatches) {
    const list = cmoBySource.get(match.record.source) ?? [];
    list.push(match);
    cmoBySource.set(match.record.source, list);
  }
  for (const [sourceId, matches] of cmoBySource) {
    const pres = CMO_PRESENTATION[sourceId];
    const sorted = [...matches].sort((a, b) => b.score - a.score);
    groups.push({
      key: sourceId,
      source: pres.source,
      region: pres.region,
      flag: flagFor(pres.region),
      total: matches.length,
      confidence: "high",
      hits: sorted.slice(0, MAX_HITS).map((m) => ({ title: m.record.title })),
    });
  }

  // CMO web (name scrapes) — fuzzy confidence, titles stay blurred
  const webBySource = new Map<CmoWebSourceId, CmoWebHit[]>();
  for (const hit of input.cmoWebHits) {
    const list = webBySource.get(hit.source) ?? [];
    list.push(hit);
    webBySource.set(hit.source, list);
  }
  for (const [sourceId, hits] of webBySource) {
    const pres = CMO_WEB_PRESENTATION[sourceId];
    groups.push({
      key: `web-${sourceId}`,
      source: pres.source,
      region: pres.region,
      flag: flagFor(pres.region),
      total: hits.length,
      confidence: "fuzzy",
      hits: [],
    });
  }

  // Hungarian sources first, then by volume.
  groups.sort((a, b) => {
    const ah = a.region === "Magyarország" ? 0 : 1;
    const bh = b.region === "Magyarország" ? 0 : 1;
    if (ah !== bh) return ah - bh;
    return b.total - a.total;
  });

  const totalItems = groups.reduce((sum, g) => sum + g.total, 0);
  const countries = new Set(groups.map((g) => g.region)).size;

  return {
    status: groups.length > 0 ? "found" : "none",
    resolvedName,
    groups,
    summary: { totalItems, societies: groups.length, countries },
  };
}
