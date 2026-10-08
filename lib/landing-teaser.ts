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

export type LandingRightType = "author" | "neighbouring";

export const RIGHT_LABEL: Record<LandingRightType, string> = {
  author: "Szerzői jog",
  neighbouring: "Szomszédos jog",
};

/**
 * One country × right-type group in the gated teaser. Collecting societies are never named
 * on the public page; `source` carries the right-type label.
 */
export interface LandingTeaserGroup {
  key: string;
  source: string;
  right: LandingRightType;
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
  /** `societies` is for internal logging only. */
  summary: { totalItems: number; societies: number; countries: number; rights: LandingRightType[] };
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

interface SourcePresentation {
  region: string;
  right: LandingRightType;
}

const CMO_PRESENTATION: Record<CmoSourceId, SourcePresentation> = {
  "at-akm": { region: "Ausztria", right: "author" },
  "at-aume": { region: "Ausztria", right: "author" },
  "nl-sena": { region: "Hollandia", right: "neighbouring" },
  "se-stim": { region: "Svédország", right: "author" },
  "sk-soza": { region: "Szlovákia", right: "author" },
  "ro-credidam": { region: "Románia", right: "neighbouring" },
  "hr-hds-zamp": { region: "Horvátország", right: "author" },
  "ro-ucmr-ada": { region: "Románia", right: "author" },
  "ee-eau": { region: "Észtország", right: "author" },
  "ee-eel": { region: "Észtország", right: "neighbouring" },
  "cz-intergram": { region: "Csehország", right: "neighbouring" },
  "fi-gramex": { region: "Finnország", right: "neighbouring" },
  "de-gvl": { region: "Németország", right: "neighbouring" },
  "hu-mahasz": { region: "Magyarország", right: "neighbouring" },
  "de-gema": { region: "Németország", right: "author" },
  "hu-artisjus-fuggo": { region: "Magyarország", right: "author" },
};

const CMO_WEB_PRESENTATION: Record<CmoWebSourceId, SourcePresentation> = {
  zaiks: { region: "Lengyelország", right: "author" },
  sacem: { region: "Franciaország", right: "author" },
  spedidam: { region: "Franciaország", right: "neighbouring" },
  sami: { region: "Svédország", right: "neighbouring" },
  koda: { region: "Dánia", right: "author" },
  prs: { region: "Egyesült Királyság", right: "author" },
  sgae: { region: "Spanyolország", right: "author" },
  buma: { region: "Hollandia", right: "author" },
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

/** Pure aggregation: flat source lists → gated, country × right-type teaser payload. */
export function buildLandingTeaser(input: BuildLandingTeaserInput): LandingTeaserResult {
  const { resolvedName, available } = input;

  if (!available) {
    return {
      status: "unavailable",
      resolvedName,
      groups: [],
      summary: { totalItems: 0, societies: 0, countries: 0, rights: [] },
    };
  }

  const parts: SourcePart[] = [];

  // ARTISJUS (HU) — main index + függő list as one source, deduplicated by Műkód.
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
    parts.push({
      region: "Magyarország",
      right: "author",
      total: input.artisjusMatches.length + fuggoMatches.length,
      confidence: hasPerformer ? "high" : "fuzzy",
      hits: hasPerformer
        ? [
            ...performerish.map((m) => ({ title: m.work.mucim })),
            ...fuggoMatches.map((m) => ({ title: m.record.title })),
          ]
        : [],
    });
  }

  // EJI (HU, neighbouring) — domestic, high confidence
  if (input.ejiHits.length > 0) {
    parts.push({
      region: "Magyarország",
      right: "neighbouring",
      total: input.ejiHits.length,
      confidence: "high",
      hits: input.ejiHits
        .filter((h): h is Extract<EjiHit, { kind: "track" }> => h.kind === "track")
        .map((h) => ({ title: h.title, year: h.publicationYear ?? undefined })),
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
    const foreignSingle = singleTokenQuery && pres.region !== "Magyarország";
    parts.push({
      ...pres,
      total: matches.length,
      confidence: foreignSingle ? "fuzzy" : "high",
      hits: foreignSingle
        ? []
        : [...matches].sort((a, b) => b.score - a.score).map((m) => ({ title: m.record.title })),
    });
  }

  // CMO web (name scrapes) — fuzzy confidence, titles stay blurred
  const webCounts = new Map<CmoWebSourceId, number>();
  for (const hit of input.cmoWebHits) webCounts.set(hit.source, (webCounts.get(hit.source) ?? 0) + 1);
  for (const [sourceId, total] of webCounts) {
    parts.push({ ...CMO_WEB_PRESENTATION[sourceId], total, confidence: "fuzzy", hits: [] });
  }

  const groups = groupByCountryAndRight(parts);
  const totalItems = groups.reduce((sum, g) => sum + g.total, 0);
  const countries = new Set(groups.map((g) => g.region)).size;
  const rights = (["author", "neighbouring"] as const).filter((r) => groups.some((g) => g.right === r));

  return {
    status: groups.length > 0 ? "found" : "none",
    resolvedName,
    groups,
    summary: { totalItems, societies: parts.length, countries, rights },
  };
}

interface SourcePart extends SourcePresentation {
  total: number;
  confidence: "high" | "fuzzy";
  hits: LandingTeaserHit[];
}

function groupByCountryAndRight(parts: SourcePart[]): LandingTeaserGroup[] {
  const byKey = new Map<string, SourcePart[]>();
  for (const part of parts) {
    const key = `${part.region}|${part.right}`;
    byKey.set(key, [...(byKey.get(key) ?? []), part]);
  }
  const groups: LandingTeaserGroup[] = [];
  for (const [key, members] of byKey) {
    const { region, right } = members[0];
    const high = members.filter((m) => m.confidence === "high").sort((a, b) => b.total - a.total);
    groups.push({
      key,
      source: RIGHT_LABEL[right],
      right,
      region,
      flag: flagFor(region),
      total: members.reduce((sum, m) => sum + m.total, 0),
      confidence: high.length > 0 ? "high" : "fuzzy",
      hits: pickHits(high.flatMap((m) => m.hits)),
    });
  }
  // Hungary first, then by volume.
  return groups.sort((a, b) => {
    const ah = a.region === "Magyarország" ? 0 : 1;
    const bh = b.region === "Magyarország" ? 0 : 1;
    if (ah !== bh) return ah - bh;
    return b.total - a.total;
  });
}
