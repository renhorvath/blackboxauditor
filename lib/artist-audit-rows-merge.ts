import type { AuditRow } from "@/lib/types";

function isrcKey(isrc: string | null | undefined): string {
  return (isrc ?? "").trim().toUpperCase().replace(/-/g, "");
}

/** Keep catalog enrich fields when MLC background pass replaces row set. */
export function mergeAuditRowsPreservingEnrich(
  prev: AuditRow[] | null | undefined,
  next: AuditRow[],
): AuditRow[] {
  if (!prev?.length) return next;

  const enrichedByIsrc = new Map<string, AuditRow>();
  for (const row of prev) {
    const key = isrcKey(row.isrc);
    if (!key) continue;
    if (row.catalogEnrich || row.iswc?.trim() || row.rawBatchData) {
      enrichedByIsrc.set(key, row);
    }
  }

  return next.map((row) => {
    const key = isrcKey(row.isrc);
    if (!key) return row;
    const old = enrichedByIsrc.get(key);
    if (!old) return row;
    return {
      ...row,
      iswc: row.iswc?.trim() || old.iswc,
      rawBatchData: row.rawBatchData ?? old.rawBatchData,
      catalogEnrich: row.catalogEnrich ?? old.catalogEnrich,
      shareTotal: row.shareTotal ?? old.shareTotal,
      shareStatus:
        row.shareStatus && row.shareStatus !== "missing" ? row.shareStatus : old.shareStatus,
      songwriterCount: row.songwriterCount || old.songwriterCount,
      publisherCount: row.publisherCount || old.publisherCount,
    };
  });
}
