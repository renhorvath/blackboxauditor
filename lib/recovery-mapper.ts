import type { AuditRow } from "@/lib/types";
import type { SourceDetailBlock } from "@/lib/artist-audit-row-details";
import type { CmoSourceId } from "@/lib/cmo-types";

/** Map audit row + source block to recovery playbook id(s). */
export function playbookIdsForRow(row: AuditRow): string[] {
  const ids = new Set<string>();
  if (row.artisjusMatched) ids.add("hu.artisjus.unidentified_work");
  if (row.mlcMatchStatus === "unmatched") ids.add("us.mlc.unmatched_recording");
  if (row.mlcUnclaimed) ids.add("us.mlc.unclaimed_share");
  for (const hit of row.cmoHits ?? []) {
    for (const id of playbookIdsForCmoHit(hit.source, hit)) ids.add(id);
  }
  for (const hit of row.ejiHits ?? []) {
    ids.add("hu.eji.unidentified");
  }
  return [...ids];
}

function playbookIdsForCmoHit(
  source: CmoSourceId,
  hit: {
    senaRole?: string;
    gvlList?: string;
  },
): string[] {
  if (source === "de-gvl") {
    const list = hit.gvlList;
    if (list === "listen-artists") return ["de.gvl.listen_artist"];
    if (list === "listen-producers") return ["de.gvl.listen_producer"];
    if (list === "produktionen") return ["de.gvl.konu"];
    if (list === "sendemeldungen") return ["de.gvl.sendemeldung"];
    return ["de.gvl.konu"];
  }
  if (source === "nl-sena") {
    if (hit.senaRole === "producenten") return ["nl.sena.producent"];
    return ["nl.sena.performer"];
  }
  if (source === "at-akm") return ["at.akm.unidentified_work"];
  if (source === "at-aume") return ["at.aume.mechanical"];
  return [`cmo.generic.${source}`];
}

export function playbookIdForBlock(block: SourceDetailBlock, row: AuditRow): string | null {
  if (block.id === "artisjus") return "hu.artisjus.unidentified_work";
  if (block.id === "mlc-unmatched") return "us.mlc.unmatched_recording";
  if (block.id === "mlc-unclaimed") return "us.mlc.unclaimed_share";
  if (block.id.startsWith("eji-")) return "hu.eji.unidentified";
  if (block.id.startsWith("cmo-de-gvl")) {
    const hit = row.cmoHits?.find((h) => block.id.includes(h.recordId));
    if (hit?.gvlList === "listen-artists") return "de.gvl.listen_artist";
    if (hit?.gvlList === "listen-producers") return "de.gvl.listen_producer";
    if (hit?.gvlList === "sendemeldungen") return "de.gvl.sendemeldung";
    return "de.gvl.konu";
  }
  if (block.id.startsWith("cmo-nl-sena")) {
    const hit = row.cmoHits?.find((h) => block.id.includes(h.recordId));
    if (hit?.senaRole === "producenten") return "nl.sena.producent";
    return "nl.sena.performer";
  }
  if (block.id.startsWith("cmo-at-akm")) return "at.akm.unidentified_work";
  if (block.id.startsWith("cmo-at-aume")) return "at.aume.mechanical";
  if (block.id.startsWith("cmo-")) {
    const source = block.id.split("-")[1] as CmoSourceId | undefined;
    if (source) return `cmo.generic.${source}`;
  }
  return null;
}
