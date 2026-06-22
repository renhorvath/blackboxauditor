import {
  deriveGapBadges,
  GAP_PRIORITY_RANK,
  userFacingGapBadges,
} from "@/lib/audit-core/derive-gap-badges";
import type { GapBadge, GapKind } from "@/lib/audit-core/gap-types";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { auditRowKey, getRowSourceIds } from "@/lib/artist-audit-filters";
import type { AuditRow } from "@/lib/types";

/** Tie-break after gap priority — docs/ui_ab_roadmap.md Sprint 5. */
export const GAP_KIND_RANK: Record<GapKind, number> = {
  listed_and_registered: 0,
  blackbox_only: 1,
  missing_iswc: 2,
  missing_ipi: 3,
  share_incomplete: 4,
  name_only_match: 5,
  catalog_clean: 6,
};

export function primaryGapBadge(row: AuditRow, queryArtistName?: string): GapBadge | null {
  const badges = deriveGapBadges(row, queryArtistName);
  if (badges.length === 0) return null;
  return [...badges].sort(compareGapBadges)[0] ?? null;
}

export function compareGapBadges(a: GapBadge, b: GapBadge): number {
  const pd = GAP_PRIORITY_RANK[a.priority] - GAP_PRIORITY_RANK[b.priority];
  if (pd !== 0) return pd;
  return GAP_KIND_RANK[a.kind] - GAP_KIND_RANK[b.kind];
}

const USER_PUBLISH_KINDS = new Set<GapKind>([
  "blackbox_only",
  "listed_and_registered",
  "missing_iswc",
  "missing_ipi",
  "share_incomplete",
]);

/** User publish: P0/P1 gaps; P2 name-only only in ops mode (roadmap §4). */
export function rowIsPublishEligible(
  row: AuditRow,
  queryArtistName?: string,
  options?: { opsMode?: boolean },
): boolean {
  if (!rowHasPayoutProblem(row)) return false;
  const primary = primaryGapBadge(row, queryArtistName);
  if (!primary) return true;

  if (primary.priority === "P2" && !options?.opsMode) return false;
  if (primary.kind === "name_only_match" && !options?.opsMode) return false;
  if (primary.kind === "catalog_clean") return false;
  return (
    USER_PUBLISH_KINDS.has(primary.kind) ||
    (options?.opsMode === true && primary.kind === "name_only_match")
  );
}

export interface ActionableGapRow {
  findingKey: string;
  priority: string;
  gapKind: string;
  gapLabel: string;
  catalogHint: string;
  title: string;
  isrc: string;
  artist: string;
  iswc: string;
  mlcStatus: string;
  artisjus: string;
  sources: string;
}

export function buildActionableGapRows(
  rows: AuditRow[],
  queryArtistName: string,
  options?: { problemsOnly?: boolean; opsMode?: boolean },
): ActionableGapRow[] {
  const problemsOnly = options?.problemsOnly ?? true;
  const source = problemsOnly ? rows.filter(rowHasPayoutProblem) : rows;

  const out: ActionableGapRow[] = [];
  for (const row of source) {
    if (!rowIsPublishEligible(row, queryArtistName, { opsMode: options?.opsMode }) && problemsOnly) {
      continue;
    }
    const primary = primaryGapBadge(row, queryArtistName);
    const top = primary ?? userFacingGapBadges(deriveGapBadges(row, queryArtistName), 1)[0];
    out.push({
      findingKey: auditRowKey(row),
      priority: top?.priority ?? "",
      gapKind: top?.kind ?? "",
      gapLabel: top?.label ?? "",
      catalogHint: top?.catalogHint ?? "",
      title: row.title?.trim() ?? "",
      isrc: row.isrc?.trim() ?? "",
      artist: row.artist?.trim() ?? "",
      iswc: row.iswc?.trim() ?? "",
      mlcStatus: row.mlcMatchStatus,
      artisjus: row.artisjusMatched ? "igen" : "nem",
      sources: getRowSourceIds(row).join(";"),
    });
  }

  return out.sort((a, b) => {
    const pa = a.priority in GAP_PRIORITY_RANK ? GAP_PRIORITY_RANK[a.priority as GapBadge["priority"]] : 9;
    const pb = b.priority in GAP_PRIORITY_RANK ? GAP_PRIORITY_RANK[b.priority as GapBadge["priority"]] : 9;
    if (pa !== pb) return pa - pb;
    const ka = (a.gapKind as GapKind) in GAP_KIND_RANK ? GAP_KIND_RANK[a.gapKind as GapKind] : 9;
    const kb = (b.gapKind as GapKind) in GAP_KIND_RANK ? GAP_KIND_RANK[b.gapKind as GapKind] : 9;
    if (ka !== kb) return ka - kb;
    return a.title.localeCompare(b.title, "hu", { sensitivity: "base" });
  });
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function actionableGapsToCsv(rows: ActionableGapRow[]): string {
  const headers = [
    "priority",
    "gap_kind",
    "gap_label",
    "catalog_hint",
    "title",
    "isrc",
    "artist",
    "iswc",
    "mlc_status",
    "artisjus",
    "sources",
    "finding_key",
  ] as const;

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.priority,
        row.gapKind,
        row.gapLabel,
        row.catalogHint,
        row.title,
        row.isrc,
        row.artist,
        row.iswc,
        row.mlcStatus,
        row.artisjus,
        row.sources,
        row.findingKey,
      ]
        .map((v) => csvEscape(v))
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function downloadActionableGapsCsv(
  rows: AuditRow[],
  artistName: string,
  options?: { problemsOnly?: boolean; opsMode?: boolean },
): void {
  const gapRows = buildActionableGapRows(rows, artistName, options);
  const csv = actionableGapsToCsv(gapRows);
  const slug = artistName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "artist";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slug}_actionable_gaps.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
