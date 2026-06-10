import { buildAuditSummary } from "@/lib/audit-engine";
import { buildRowsFromMlcHits, mergeMlcUnclaimedHits } from "@/lib/mlc-enrich";
import type { MlcArtistScanResult, MlcUnclaimedScanResult } from "@/lib/mlc-artist-scan";
import type { ArtistAuditMeta, AuditRow, AuditSummary } from "@/lib/types";

function mergeMlcFieldsIntoRow(existing: AuditRow, mlcRow: AuditRow): AuditRow {
  const issueTypes = new Set(existing.issues.map((i) => i.type));
  const mergedIssues = [
    ...existing.issues,
    ...mlcRow.issues.filter((i) => !issueTypes.has(i.type)),
  ];
  return {
    ...existing,
    title: existing.title || mlcRow.title,
    artist: existing.artist || mlcRow.artist,
    mlcMatchStatus: mlcRow.mlcMatchStatus,
    mlcUnclaimed: mlcRow.mlcUnclaimed ?? existing.mlcUnclaimed,
    mlcProvider: mlcRow.mlcProvider ?? existing.mlcProvider,
    mlcResourceType: mlcRow.mlcResourceType ?? existing.mlcResourceType,
    issues: mergedIssues,
  };
}

/** Merge MLC phase payload into a core-phase audit (client-side, after second request). */
export function mergeMlcIntoArtistAudit(
  core: { rows: AuditRow[]; summary: AuditSummary; meta: ArtistAuditMeta },
  mlc: {
    mlcUnmatched: MlcArtistScanResult | null;
    mlcUnclaimed: MlcUnclaimedScanResult | null;
  },
): { rows: AuditRow[]; summary: AuditSummary; meta: ArtistAuditMeta } {
  const mlcRows = mergeMlcUnclaimedHits(
    buildRowsFromMlcHits(mlc.mlcUnmatched?.hits ?? []),
    mlc.mlcUnclaimed?.hits ?? [],
  );

  const mlcByIsrc = new Map(
    mlcRows.filter((r) => r.isrc).map((r) => [r.isrc.toUpperCase(), r]),
  );
  const usedMlc = new Set<string>();
  const merged: AuditRow[] = [];

  for (const row of core.rows) {
    const key = row.isrc?.toUpperCase() ?? "";
    const mlcRow = key ? mlcByIsrc.get(key) : undefined;
    if (mlcRow) {
      merged.push(mergeMlcFieldsIntoRow(row, mlcRow));
      usedMlc.add(key);
    } else {
      merged.push(row);
    }
  }

  for (const mlcRow of mlcRows) {
    const key = mlcRow.isrc?.toUpperCase() ?? "";
    if (key && usedMlc.has(key)) continue;
    merged.push(mlcRow);
  }

  const meta: ArtistAuditMeta = {
    ...core.meta,
    mlcPending: false,
    isrcCount:
      (mlc.mlcUnmatched?.uniqueIsrcCount ?? 0) + (mlc.mlcUnclaimed?.uniqueIsrcCount ?? 0),
    mlcUnmatchedCount: mlc.mlcUnmatched?.uniqueIsrcCount ?? 0,
    mlcUnclaimedCount: mlc.mlcUnclaimed?.uniqueIsrcCount ?? 0,
    mlcScanSource: mlc.mlcUnmatched?.scanSource ?? "none",
    mlcUnclaimedScanSource: mlc.mlcUnclaimed?.scanSource ?? "none",
    mlcUnmatchedSkipped: false,
    mlcUnclaimedSkipped: false,
  };

  return {
    rows: merged,
    summary: buildAuditSummary(merged),
    meta,
  };
}
