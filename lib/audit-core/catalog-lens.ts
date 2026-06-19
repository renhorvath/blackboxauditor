import type { ArtistAuditMeta } from "@/lib/types";
import type { AuditRow } from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

/** True when at least one row carries catalog-style identifiers (A-side hints). */
export function computeCatalogReady(rows: AuditRow[], artisjusCount: number): boolean {
  if (artisjusCount > 0) return true;
  return rows.some((row) => {
    if (row.iswc?.trim()) return true;
    if (row.mlcMatchStatus === "matched") return true;
    return Boolean(row.isrc?.trim()) && !isSyntheticAuditIsrc(row.isrc);
  });
}

/** Catalog lens: ops always when rows exist; user only when catalogReady (Spotify later). */
export function catalogLensAvailable(
  opsMode: boolean,
  meta: Pick<ArtistAuditMeta, "catalogReady">,
  rowCount: number,
): boolean {
  if (rowCount === 0) return false;
  if (opsMode) return true;
  return meta.catalogReady === true;
}
