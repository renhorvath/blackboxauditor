import type { ArtisjusArtistMatch } from "@/lib/artisjus-types";
import type { CmoArtistMatch, CmoSourceId } from "@/lib/cmo-types";
import type { CmoWebHit, CmoWebSourceId } from "@/lib/cmo-web/web-types";
import type { EjiHit } from "@/lib/cmo-web/eji-types";
import { uniqueTokens } from "@/lib/index-tokens";

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
  "hu-mahasz": { source: "MAHASZ", region: "Magyarország" },
  "de-gema": { source: "GEMA", region: "Németország" },
  "hu-artisjus-fuggo": { source: "ARTISJUS · függő", region: "Magyarország" },
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

const HTML_ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Readable, distinct titles first — placeholder titles ("(névtelen)") would hide real hits. */
function pickHits(hits: LandingTeaserHit[]): LandingTeaserHit[] {
  const seen = new Set<string>();
  const out: LandingTeaserHit[] = [];
  for (const hit of hits) {
    const title = decodeEntities(hit.title ?? "").trim();
    if (!title || title.startsWith("(")) continue;
    const key = title.toLocaleLowerCase("hu");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...hit, title });
    if (out.length >= MAX_HITS) break;
  }
  return out;
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

  // ARTISJUS (HU) — main index + függő list as one group, deduplicated by Műkód.
  // Performer/both = high; rights-only surname credits = fuzzy.
  const mainMukods = new Set(input.artisjusMatches.map((m) => m.work.mukod));
  const fuggoMatches = input.cmoMatches
    .filter(
      (m) =>
        m.record.source === "hu-artisjus-fuggo" &&
        !mainMukods.has(m.record.id.slice(m.record.id.indexOf(":") + 1)),
    )
    .sort((a, b) => b.score - a.score);
  if (input.artisjusMatches.length > 0 || fuggoMatches.length > 0) {
    const sorted = [...input.artisjusMatches].sort((a, b) => b.score - a.score);
    const performerish = sorted.filter((m) => m.matchKind !== "rights");
    const hasPerformer = performerish.length > 0 || fuggoMatches.length > 0;
    groups.push({
      key: "artisjus",
      source: "ARTISJUS",
      region: "Magyarország",
      flag: flagFor("Magyarország"),
      total: input.artisjusMatches.length + fuggoMatches.length,
      confidence: hasPerformer ? "high" : "fuzzy",
      hits: hasPerformer
        ? pickHits([
            ...performerish.map((m) => ({ title: m.work.mucim })),
            ...fuggoMatches.map((m) => ({ title: m.record.title })),
          ])
        : [],
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
      hits: pickHits(trackTitles),
    });
  }

  // EU CMO indexes — single-token queries are ambiguous abroad (Elefánt≈Elefant label/title noise)
  const singleTokenQuery = uniqueTokens(resolvedName, 2).length <= 1;
  const cmoBySource = new Map<CmoSourceId, CmoArtistMatch[]>();
  for (const match of input.cmoMatches) {
    if (match.record.source === "hu-artisjus-fuggo") continue;
    const list = cmoBySource.get(match.record.source) ?? [];
    list.push(match);
    cmoBySource.set(match.record.source, list);
  }
  for (const [sourceId, matches] of cmoBySource) {
    const pres = CMO_PRESENTATION[sourceId];
    if (!pres) continue;
    const sorted = [...matches].sort((a, b) => b.score - a.score);
    const foreignSingle = singleTokenQuery && pres.region !== "Magyarország";
    groups.push({
      key: sourceId,
      source: pres.source,
      region: pres.region,
      flag: flagFor(pres.region),
      total: matches.length,
      confidence: foreignSingle ? "fuzzy" : "high",
      hits: foreignSingle ? [] : pickHits(sorted.map((m) => ({ title: m.record.title }))),
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
