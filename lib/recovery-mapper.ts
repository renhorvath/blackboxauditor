import type { AuditRow } from "@/lib/types";
import type { SourceDetailBlock } from "@/lib/artist-audit-row-details";
import { CMO_SOURCE_IDS, type CmoSourceId } from "@/lib/cmo-types";

/** Default playbook per indexed CMO source (excluding GVL/SENA role splits). */
const CMO_PLAYBOOK_ID: Record<
  Exclude<CmoSourceId, "de-gvl" | "nl-sena">,
  string
> = {
  "at-akm": "at.akm.unidentified_work",
  "at-aume": "at.aume.mechanical",
  "se-stim": "se.stim.unidentified_work",
  "sk-soza": "sk.soza.unidentified_work",
  "ro-credidam": "ro.credidam.unidentified_work",
  "hr-hds-zamp": "hr.hds_zamp.unidentified_work",
  "ro-ucmr-ada": "ro.ucmr_ada.unidentified_work",
  "ee-eau": "ee.eau.unidentified_work",
  "ee-eel": "ee.eel.unidentified_work",
  "cz-intergram": "cz.intergram.unidentified_work",
  "fi-gramex": "fi.gramex.unidentified_work",
};

function parseCmoSourceFromBlockId(blockId: string): CmoSourceId | null {
  if (!blockId.startsWith("cmo-") || blockId.startsWith("cmo-web-")) return null;
  const rest = blockId.slice(4);
  for (const source of CMO_SOURCE_IDS) {
    if (rest.startsWith(`${source}-`)) return source;
  }
  return null;
}

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
  const id = CMO_PLAYBOOK_ID[source];
  return id ? [id] : [];
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
  const hit = row.cmoHits?.find((h) => block.id === `cmo-${h.source}-${h.recordId}`);
  if (hit) return playbookIdsForCmoHit(hit.source, hit)[0] ?? null;
  const source = parseCmoSourceFromBlockId(block.id);
  if (source && source !== "de-gvl" && source !== "nl-sena") {
    return CMO_PLAYBOOK_ID[source];
  }
  return null;
}
