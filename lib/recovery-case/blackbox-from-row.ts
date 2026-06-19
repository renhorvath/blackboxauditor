import { CMO_CHIP_LABELS, type CmoSourceId } from "@/lib/cmo-types";
import { playbookIdsForCmoHitInternal } from "@/lib/recovery-case/playbook-helpers";
import type { BlackboxHit } from "@/lib/recovery-case/types";
import type { AuditRow } from "@/lib/types";

export function blackboxHitsFromRow(row: AuditRow): BlackboxHit[] {
  const hits: BlackboxHit[] = [];

  if (row.artisjusMatched) {
    hits.push({
      source: "artisjus",
      recordId: row.artisjusMukod?.trim() || row.title || "unknown",
      playbookId: "hu.artisjus.unidentified_work",
      region: "Magyarország",
      listType: "azonosítatlan_mű",
      headline: "ARTISJUS azonosítatlan",
    });
  }

  if (row.mlcMatchStatus === "unmatched") {
    hits.push({
      source: "mlc-unmatched",
      recordId: row.mlcDspResourceId?.trim() || row.isrc || row.title || "unknown",
      playbookId: "us.mlc.unmatched_recording",
      region: "USA",
      listType: "unmatched_recording",
    });
  }

  if (row.mlcUnclaimed) {
    hits.push({
      source: "mlc-unclaimed",
      recordId: row.mlcWorkRecordId?.trim() || row.isrc || "unknown",
      playbookId: "us.mlc.unclaimed_share",
      region: "USA",
      listType: "unclaimed_share",
    });
  }

  for (const hit of row.cmoHits ?? []) {
    const playbookIds = playbookIdsForCmoHitInternal(hit.source, hit);
    const playbookId = playbookIds[0];
    if (!playbookId) continue;
    hits.push({
      source: `cmo-${hit.source}`,
      recordId: hit.recordId,
      playbookId,
      region: CMO_CHIP_LABELS[hit.source as CmoSourceId]?.split(" · ")[0],
      listType: hit.gvlList ?? hit.senaRole ?? undefined,
      headline: hit.title,
    });
  }

  for (const hit of row.ejiHits ?? []) {
    hits.push({
      source: "eji",
      recordId: hit.recordId,
      playbookId: "hu.eji.unidentified",
      region: "Magyarország",
      listType: hit.kind,
      headline: hit.title ?? hit.name,
    });
  }

  return hits;
}
