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

export type LandingRightType = "producer" | "performer" | "author";

export const RIGHT_ORDER: readonly LandingRightType[] = ["producer", "performer", "author"];

export const RIGHT_LABEL: Record<LandingRightType, string> = {
  producer: "Hangfelvétel-előállítói jog",
  performer: "Előadóművészi jog",
  author: "Szerzői jog",
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
  /**
   * `societies` is for internal logging only.
   * `rights` lists the ticked categories. `titles` is at most three, and never tied to a country.
   */
  summary: {
    totalItems: number;
    societies: number;
    countries: number;
    rights: LandingRightType[];
    titles: string[];
  };
}

const MAX_HITS = 3;

interface SourcePresentation {
  region: string;
  right: LandingRightType;
}

const CMO_PRESENTATION: Record<CmoSourceId, SourcePresentation> = {
  "at-akm": { region: "Ausztria", right: "author" },
  "at-aume": { region: "Ausztria", right: "author" },
  "nl-sena": { region: "Hollandia", right: "performer" },
  "se-stim": { region: "Svédország", right: "author" },
  "sk-soza": { region: "Szlovákia", right: "author" },
  "ro-credidam": { region: "Románia", right: "performer" },
  "hr-hds-zamp": { region: "Horvátország", right: "author" },
  "ro-ucmr-ada": { region: "Románia", right: "author" },
  "ee-eau": { region: "Észtország", right: "author" },
  "ee-eel": { region: "Észtország", right: "performer" },
  "cz-intergram": { region: "Csehország", right: "performer" },
  "fi-gramex": { region: "Finnország", right: "performer" },
  "de-gvl": { region: "Németország", right: "performer" },
  "hu-mahasz": { region: "Magyarország", right: "producer" },
  "de-gema": { region: "Németország", right: "author" },
  "hu-artisjus-fuggo": { region: "Magyarország", right: "author" },
};

const CMO_WEB_PRESENTATION: Record<CmoWebSourceId, SourcePresentation> = {
  zaiks: { region: "Lengyelország", right: "author" },
  sacem: { region: "Franciaország", right: "author" },
  spedidam: { region: "Franciaország", right: "performer" },
  sami: { region: "Svédország", right: "performer" },
  koda: { region: "Dánia", right: "author" },
  prs: { region: "Egyesült Királyság", right: "author" },
  sgae: { region: "Spanyolország", right: "author" },
  buma: { region: "Hollandia", right: "author" },
};

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

const HU_MARK = /[áéíóöőúüű]/i;
const TITLE_LIMIT = 28;

/** "FOLYTASD BÁTRAN TOVÁBB" copied over and over becomes the phrase once. */
function collapseRepeats(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    let bestSize = 1;
    let bestReps = 1;
    const maxSize = Math.min(8, Math.floor((words.length - i) / 2));
    for (let size = 1; size <= maxSize; size++) {
      const chunk = words.slice(i, i + size).join(" ").toLocaleLowerCase("hu");
      let reps = 1;
      while (i + (reps + 1) * size <= words.length) {
        const next = words
          .slice(i + reps * size, i + (reps + 1) * size)
          .join(" ")
          .toLocaleLowerCase("hu");
        if (next !== chunk) break;
        reps++;
      }
      if (reps >= 2 && size * reps > bestSize * bestReps) {
        bestSize = size;
        bestReps = reps;
      }
    }
    out.push(...words.slice(i, i + bestSize));
    i += bestSize * bestReps;
  }
  return out.join(" ");
}

function clipTitle(title: string): string {
  if (title.length <= TITLE_LIMIT) return title;
  const cut = title.slice(0, TITLE_LIMIT + 1);
  const space = cut.lastIndexOf(" ");
  const base = (space >= 16 ? cut.slice(0, space) : title.slice(0, TITLE_LIMIT)).replace(/[.,;:\-–—]+$/, "");
  return `${base}…`;
}

/** At most three titles. Accented Hungarian titles come first, so a bare ASCII title cannot point at a foreign list. */
function pickPublicTitles(hits: ScoredHit[]): string[] {
  const seen = new Set<string>();
  const cleaned: { title: string; score: number; marked: number }[] = [];
  for (const hit of hits) {
    const title = clipTitle(collapseRepeats(decodeEntities(hit.title ?? "").trim()));
    if (!title || title.startsWith("(")) continue;
    const key = title.toLocaleLowerCase("hu");
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({ title, score: hit.score, marked: HU_MARK.test(title) ? 0 : 1 });
  }
  cleaned.sort((a, b) => a.marked - b.marked || b.score - a.score);
  return cleaned.slice(0, MAX_HITS).map((hit) => hit.title);
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
      summary: { totalItems: 0, societies: 0, countries: 0, rights: [], titles: [] },
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
            ...performerish.map((m) => ({ title: m.work.mucim, score: m.score })),
            ...fuggoMatches.map((m) => ({ title: m.record.title, score: m.score })),
          ]
        : [],
    });
  }

  // EJI (HU, neighbouring) — domestic, high confidence
  if (input.ejiHits.length > 0) {
    parts.push({
      region: "Magyarország",
      right: "performer",
      total: input.ejiHits.length,
      confidence: "high",
      hits: input.ejiHits
        .filter((h): h is Extract<EjiHit, { kind: "track" }> => h.kind === "track")
        .map((h) => ({ title: h.title, score: 1 })),
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
        : [...matches]
            .sort((a, b) => b.score - a.score)
            .map((m) => ({ title: m.record.title, score: m.score })),
    });
  }

  // CMO web (name scrapes) — fuzzy confidence, titles stay blurred
  const webCounts = new Map<CmoWebSourceId, number>();
  for (const hit of input.cmoWebHits) webCounts.set(hit.source, (webCounts.get(hit.source) ?? 0) + 1);
  for (const [sourceId, total] of webCounts) {
    parts.push({ ...CMO_WEB_PRESENTATION[sourceId], total, confidence: "fuzzy", hits: [] });
  }

  const totalItems = parts.reduce((sum, part) => sum + part.total, 0);
  const countries = new Set(parts.map((part) => part.region)).size;
  const rights = RIGHT_ORDER.filter((right) => parts.some((part) => part.right === right));
  const titles = pickPublicTitles(
    parts.filter((part) => part.confidence === "high" && rights.includes(part.right)).flatMap((part) => part.hits),
  );

  return {
    status: parts.length > 0 ? "found" : "none",
    resolvedName,
    // Country and society stay off the response: the page only shows counts, ticks and titles.
    groups: [],
    summary: { totalItems, societies: parts.length, countries, rights, titles },
  };
}

interface ScoredHit {
  title: string;
  score: number;
}

interface SourcePart extends SourcePresentation {
  total: number;
  confidence: "high" | "fuzzy";
  hits: ScoredHit[];
}
