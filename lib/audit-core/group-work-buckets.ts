import {
  deriveGapBadges,
  GAP_PRIORITY_RANK,
  rowGapRank,
} from "@/lib/audit-core/derive-gap-badges";
import type { GapBadge } from "@/lib/audit-core/gap-types";
import type { WorkBucket } from "@/lib/audit-core/work-bucket-types";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { auditRowKey } from "@/lib/artist-audit-filters";
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import type { AuditRow } from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

function normalizeIswc(iswc: string | null | undefined): string {
  return (iswc ?? "").replace(/\W/g, "").toUpperCase();
}

export function workKeyForRow(row: AuditRow): string {
  const iswc = normalizeIswc(row.iswc);
  if (iswc) return `iswc:${iswc}`;
  if (row.artisjusMukod?.trim()) return `artisjus:${row.artisjusMukod.trim()}`;
  const title = normalizeArtisjusText(row.title);
  if (title) return `title:${title}`;
  if (row.isrc?.trim() && !isSyntheticAuditIsrc(row.isrc)) {
    return `isrc:${row.isrc.trim().toUpperCase()}`;
  }
  return `row:${auditRowKey(row)}`;
}

function pickPrimaryGap(recordings: AuditRow[], queryArtistName?: string): GapBadge | null {
  let best: GapBadge | null = null;
  for (const row of recordings) {
    for (const badge of deriveGapBadges(row, queryArtistName)) {
      if (!best || GAP_PRIORITY_RANK[badge.priority] < GAP_PRIORITY_RANK[best.priority]) {
        best = badge;
      }
    }
  }
  return best;
}

export function groupRowsIntoWorkBuckets(
  rows: AuditRow[],
  queryArtistName?: string,
): WorkBucket[] {
  const map = new Map<string, AuditRow[]>();
  for (const row of rows) {
    const key = workKeyForRow(row);
    const group = map.get(key);
    if (group) group.push(row);
    else map.set(key, [row]);
  }

  const buckets: WorkBucket[] = [];
  for (const [workKey, recordings] of map) {
    const title =
      recordings.map((r) => r.title?.trim()).find(Boolean) ??
      recordings.map((r) => r.artist?.trim()).find(Boolean) ??
      "(névtelen mű)";
    const iswc = recordings.map((r) => r.iswc?.trim()).find(Boolean) ?? null;
    buckets.push({
      workKey,
      title,
      iswc,
      recordings,
      primaryGap: pickPrimaryGap(recordings, queryArtistName),
      hasPayoutProblem: recordings.some(rowHasPayoutProblem),
    });
  }

  buckets.sort((a, b) => {
    const aProb = a.hasPayoutProblem ? 0 : 1;
    const bProb = b.hasPayoutProblem ? 0 : 1;
    if (aProb !== bProb) return aProb - bProb;
    const aRank = Math.min(...a.recordings.map((r) => rowGapRank(r, queryArtistName)));
    const bRank = Math.min(...b.recordings.map((r) => rowGapRank(r, queryArtistName)));
    if (aRank !== bRank) return aRank - bRank;
    return a.title.localeCompare(b.title, "hu", { sensitivity: "base" });
  });

  return buckets;
}
