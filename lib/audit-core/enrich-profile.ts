import type { AuditRow } from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

function rowIsTitled(row: AuditRow): boolean {
  return Boolean(row.title?.trim() || row.isrc?.trim());
}

/** True when every titled row uses synthetic ISRC (ARTISJUS/CMO/EJI) or none — film composer path. */
export function isSyntheticOnlyCatalog(rows: AuditRow[]): boolean {
  const titled = rows.filter(rowIsTitled);
  if (titled.length === 0) return false;
  return titled.every((r) => {
    const isrc = r.isrc?.trim();
    return !isrc || isSyntheticAuditIsrc(isrc);
  });
}

export function countRealIsrcs(rows: AuditRow[]): number {
  const seen = new Set<string>();
  for (const row of rows) {
    const isrc = row.isrc?.trim();
    if (!isrc || isSyntheticAuditIsrc(isrc)) continue;
    seen.add(isrc.toUpperCase().replace(/-/g, ""));
  }
  return seen.size;
}

export function countSyntheticTitledRows(rows: AuditRow[]): number {
  return rows.filter((row) => {
    if (!rowIsTitled(row)) return false;
    const isrc = row.isrc?.trim();
    return !isrc || isSyntheticAuditIsrc(isrc);
  }).length;
}

/**
 * Inferred from audit rows at enrich time — no manual toggle.
 * - composer: only ARTISJUS/CMO/EJI rows (no MLC black-box ISRC hits)
 * - recording: only real ISRC rows (typical performer)
 * - hybrid: both in the same audit (film scores + released tracks)
 */
export type CatalogEnrichProfile = "recording" | "composer" | "hybrid";

export function catalogEnrichProfile(rows: AuditRow[]): CatalogEnrichProfile {
  const real = countRealIsrcs(rows);
  const synthetic = countSyntheticTitledRows(rows);
  if (real > 0 && synthetic > 0) return "hybrid";
  if (real > 0) return "recording";
  return "composer";
}

/** Rows that should drive ISRC-first legs (credits.fm, MLC recording API, MLC writer brute-force). */
export function rowsForRecordingEnrich(rows: AuditRow[]): AuditRow[] {
  return rows.filter((row) => {
    const isrc = row.isrc?.trim();
    return Boolean(isrc && !isSyntheticAuditIsrc(isrc));
  });
}

/** Rows that should drive composer legs (CISAC IPI fuzzy, ISWC Net sidecar). */
export function rowsForComposerEnrich(rows: AuditRow[]): AuditRow[] {
  return rows.filter((row) => {
    if (!rowIsTitled(row)) return false;
    const isrc = row.isrc?.trim();
    return !isrc || isSyntheticAuditIsrc(isrc);
  });
}
