import {
  artistNameMatchStrength,
  splitArtistNameSegments,
  type ArtistNameMatchStrength,
} from "@/lib/artist-name-match";
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import { CMO_COVERAGE_SOURCE_IDS, type CmoSourceId } from "@/lib/cmo-types";
import type { CmoWebSourceId } from "@/lib/cmo-web/web-types";
import type { PublishedFinding } from "@/lib/report-types";
import type { AuditSourceFilterId } from "@/lib/artist-audit-filters";
import type { NameVariantOption } from "@/lib/artist-audit-filters";

const STRENGTH_ORDER: Record<ArtistNameMatchStrength, number> = {
  exact: 0,
  word: 1,
  substring: 2,
  none: 3,
};

function normKey(value: string): string {
  return normalizeArtisjusText(value).replace(/\s+/g, " ").trim();
}

export function sourceIdFromBlockId(blockId: string): AuditSourceFilterId | null {
  if (blockId === "artisjus") return "artisjus";
  if (blockId === "mlc-unmatched") return "mlc-unmatched";
  if (blockId === "mlc-unclaimed") return "mlc-unclaimed";
  if (blockId.startsWith("eji-")) return "eji";
  if (blockId.startsWith("cmo-web-")) return null;
  if (blockId.startsWith("cmo-")) {
    for (const id of CMO_COVERAGE_SOURCE_IDS) {
      if (blockId.startsWith(`cmo-${id}-`)) return id;
    }
  }
  return null;
}

export function webSourceFromBlockId(blockId: string): CmoWebSourceId | null {
  if (!blockId.startsWith("cmo-web-")) return null;
  const rest = blockId.slice("cmo-web-".length);
  const dash = rest.indexOf("-");
  if (dash < 0) return null;
  return rest.slice(0, dash) as CmoWebSourceId;
}

export function getFindingSourceIds(finding: PublishedFinding): AuditSourceFilterId[] {
  const ids = new Set<AuditSourceFilterId>();
  for (const block of finding.sourceBlocks) {
    const id = sourceIdFromBlockId(block.id);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function findingMatchesSourceFilters(
  finding: PublishedFinding,
  enabled: ReadonlySet<AuditSourceFilterId>,
): boolean {
  if (enabled.size === 0) return false;
  const sources = getFindingSourceIds(finding);
  if (sources.length === 0) return true;
  return sources.some((id) => enabled.has(id));
}

export function findingSourceFilterCount(
  findings: PublishedFinding[],
  id: AuditSourceFilterId,
): number {
  return findings.filter((f) => getFindingSourceIds(f).includes(id)).length;
}

export function collectNameVariantsFromFindings(
  query: string,
  findings: PublishedFinding[],
): NameVariantOption[] {
  const map = new Map<
    string,
    { display: string; count: number; strength: Exclude<ArtistNameMatchStrength, "none"> }
  >();

  const add = (raw: string) => {
    const display = raw.trim();
    if (!display) return;
    const strength = artistNameMatchStrength(query, display);
    if (strength === "none") return;
    const key = normKey(display);
    if (!key) return;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { display, count: 1, strength });
      return;
    }
    existing.count += 1;
    if (STRENGTH_ORDER[strength] < STRENGTH_ORDER[existing.strength]) {
      existing.strength = strength;
      existing.display = display;
    }
  };

  for (const finding of findings) {
    const artist = finding.artist?.trim();
    if (!artist) continue;
    add(artist);
    for (const seg of splitArtistNameSegments(artist)) add(seg);
  }

  return [...map.values()]
    .map((v) => ({
      key: normKey(v.display),
      display: v.display,
      count: v.count,
      strength: v.strength,
    }))
    .sort((a, b) => {
      const sa = STRENGTH_ORDER[a.strength];
      const sb = STRENGTH_ORDER[b.strength];
      if (sa !== sb) return sa - sb;
      return b.count - a.count || a.display.localeCompare(b.display, "hu", { sensitivity: "base" });
    });
}

export function findingMatchesNameVariants(
  finding: PublishedFinding,
  variantKeys: ReadonlySet<string>,
): boolean {
  if (variantKeys.size === 0) return false;
  const artist = finding.artist?.trim();
  if (!artist) return true;
  const candidates = [artist, ...splitArtistNameSegments(artist)];
  return candidates.some((c) => variantKeys.has(normKey(c)));
}

export function computeCountsFromFindings(findings: PublishedFinding[]): {
  artisjusCount: number;
  mlcUnmatchedCount: number;
  mlcUnclaimedCount: number;
  ejiCount: number;
  cmoCounts: Partial<Record<CmoSourceId, number>>;
  cmoWebCounts: Partial<Record<CmoWebSourceId, number>>;
} {
  const cmoCounts: Partial<Record<CmoSourceId, number>> = {};
  const cmoWebCounts: Partial<Record<CmoWebSourceId, number>> = {};
  let artisjusCount = 0;
  let mlcUnmatchedCount = 0;
  let mlcUnclaimedCount = 0;
  let ejiCount = 0;

  for (const finding of findings) {
    const ids = getFindingSourceIds(finding);
    if (ids.includes("artisjus")) artisjusCount += 1;
    if (ids.includes("mlc-unmatched")) mlcUnmatchedCount += 1;
    if (ids.includes("mlc-unclaimed")) mlcUnclaimedCount += 1;
    if (ids.includes("eji")) ejiCount += 1;
    for (const id of ids) {
      if (id !== "artisjus" && id !== "eji" && id !== "mlc-unmatched" && id !== "mlc-unclaimed") {
        cmoCounts[id] = (cmoCounts[id] ?? 0) + 1;
      }
    }
    for (const block of finding.sourceBlocks) {
      const webId = webSourceFromBlockId(block.id);
      if (webId) cmoWebCounts[webId] = (cmoWebCounts[webId] ?? 0) + 1;
    }
  }

  return {
    artisjusCount,
    mlcUnmatchedCount,
    mlcUnclaimedCount,
    ejiCount,
    cmoCounts,
    cmoWebCounts,
  };
}
