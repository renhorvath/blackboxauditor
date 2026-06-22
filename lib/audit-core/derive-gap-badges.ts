import { isUncertainNameMatch } from "@/lib/artist-name-match";
import type { GapBadge } from "@/lib/audit-core/gap-types";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import type { AuditRow } from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

const GAP_LABELS: Record<GapBadge["kind"], string> = {
  blackbox_only: "Listán, metaadat gyenge",
  listed_and_registered: "Listán, de regisztrálva is",
  missing_iswc: "ISWC hiányzik",
  missing_ipi: "Szerzői IPI hiány",
  share_incomplete: "Share hiányos",
  name_only_match: "Csak név egyezés",
  catalog_clean: "Katalógus rendben",
};

function hasIswc(row: AuditRow): boolean {
  return Boolean(row.iswc?.trim());
}

function hasMlcMatched(row: AuditRow): boolean {
  if (row.mlcMatchStatus === "matched") return true;
  if (row.catalogEnrich?.creditsMlcStatus === "matched") return true;
  return false;
}

function hasMissingIpiIssue(row: AuditRow): boolean {
  return row.issues.some((i) => i.type === "missing_ipi_mlc");
}

function hasShareIssue(row: AuditRow): boolean {
  return row.issues.some(
    (i) =>
      i.type === "incomplete_shares" ||
      i.type === "missing_shares" ||
      i.type === "over_allocated",
  );
}

function realIsrc(row: AuditRow): boolean {
  return Boolean(row.isrc?.trim()) && !isSyntheticAuditIsrc(row.isrc);
}

/**
 * Derive user-facing gap badges from an audit row (A×B hints on B-first rows).
 */
export function deriveGapBadges(row: AuditRow, queryArtistName?: string): GapBadge[] {
  const badges: GapBadge[] = [];
  const onBlackbox = rowHasPayoutProblem(row);

  if (queryArtistName && isUncertainNameMatch(queryArtistName, row.artist)) {
    badges.push({
      kind: "name_only_match",
      priority: "P2",
      label: GAP_LABELS.name_only_match,
      confidence: "fuzzy",
    });
  }

  if (hasMissingIpiIssue(row)) {
    badges.push({
      kind: "missing_ipi",
      priority: "P1",
      label: GAP_LABELS.missing_ipi,
      catalogHint: "MLC writer IPI hiányzik vagy nem egyezik.",
      confidence: "high",
    });
  }

  if (hasShareIssue(row)) {
    badges.push({
      kind: "share_incomplete",
      priority: "P1",
      label: GAP_LABELS.share_incomplete,
      catalogHint: "Mechanikai share-allokáció hiányos vagy túllépett.",
      confidence: "high",
    });
  }

  if (onBlackbox && (hasIswc(row) || hasMlcMatched(row))) {
    badges.push({
      kind: "listed_and_registered",
      priority: "P0",
      label: GAP_LABELS.listed_and_registered,
      catalogHint: hasIswc(row)
        ? "ISWC regisztrálva, mégis black box listán szerepel — matching / reklamáció."
        : "MLC matched, mégis unmatched listán — érdemes utánajárni.",
      confidence: "high",
    });
  }

  if (realIsrc(row) && !hasIswc(row) && onBlackbox) {
    badges.push({
      kind: "missing_iswc",
      priority: "P1",
      label: GAP_LABELS.missing_iswc,
      catalogHint: "Van ISRC, de nincs ISWC a metaadatban.",
      confidence: realIsrc(row) ? "high" : "fuzzy",
    });
  }

  if (
    onBlackbox &&
    !hasIswc(row) &&
    !hasMlcMatched(row) &&
    !badges.some((b) => b.kind === "listed_and_registered" || b.kind === "missing_iswc")
  ) {
    badges.push({
      kind: "blackbox_only",
      priority: "P0",
      label: GAP_LABELS.blackbox_only,
      catalogHint: "Black box találat; dokumentált mű-regisztráció gyenge vagy hiányzik.",
      confidence: isSyntheticAuditIsrc(row.isrc) ? "fuzzy" : "high",
    });
  }

  if (!onBlackbox && badges.length === 0) {
    return [];
  }

  const seen = new Set<GapBadge["kind"]>();
  return badges.filter((b) => {
    if (seen.has(b.kind)) return false;
    seen.add(b.kind);
    return true;
  });
}

export const GAP_PRIORITY_RANK: Record<GapBadge["priority"], number> = {
  P0: 0,
  P1: 1,
  P2: 2,
};

export function rowGapRank(row: AuditRow, queryArtistName?: string): number {
  const badges = deriveGapBadges(row, queryArtistName);
  if (badges.length === 0) return 99;
  return Math.min(...badges.map((b) => GAP_PRIORITY_RANK[b.priority]));
}

/** Max N chips on publish cards — highest-priority gaps first (docs/ui_ab_roadmap.md §6.4). */
export function userFacingGapBadges(badges: GapBadge[], limit = 2): GapBadge[] {
  return [...badges]
    .sort((a, b) => GAP_PRIORITY_RANK[a.priority] - GAP_PRIORITY_RANK[b.priority])
    .slice(0, limit);
}

export function summarizeCatalogGaps(
  rows: AuditRow[],
  queryArtistName?: string,
): {
  missingIswc: number;
  listedAndRegistered: number;
  nameOnly: number;
} {
  let missingIswc = 0;
  let listedAndRegistered = 0;
  let nameOnly = 0;

  for (const row of rows) {
    const kinds = new Set(deriveGapBadges(row, queryArtistName).map((b) => b.kind));
    if (kinds.has("missing_iswc")) missingIswc += 1;
    if (kinds.has("listed_and_registered")) listedAndRegistered += 1;
    if (kinds.has("name_only_match")) nameOnly += 1;
  }

  return { missingIswc, listedAndRegistered, nameOnly };
}

export function formatCatalogGapSummary(counts: {
  missingIswc: number;
  listedAndRegistered: number;
  nameOnly: number;
}): string | null {
  const parts: string[] = [];
  if (counts.missingIswc > 0) {
    parts.push(`${counts.missingIswc} dalnak nincs ISWC`);
  }
  if (counts.listedAndRegistered > 0) {
    parts.push(`${counts.listedAndRegistered} listás dal regisztrálva is`);
  }
  if (counts.nameOnly > 0) {
    parts.push(`${counts.nameOnly} csak név egyezés`);
  }
  if (parts.length === 0) return null;
  return parts.join(" · ");
}
