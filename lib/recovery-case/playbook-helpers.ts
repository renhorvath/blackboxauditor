import { CMO_CHIP_LABELS, type CmoSourceId } from "@/lib/cmo-types";

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

/** Shared CMO → playbook mapping (recovery-mapper mirror). */
export function playbookIdsForCmoHitInternal(
  source: CmoSourceId,
  hit: { senaRole?: string; gvlList?: string },
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

export function uniquePlaybookIdsFromRow(row: {
  artisjusMatched?: boolean;
  mlcMatchStatus?: string;
  mlcUnclaimed?: boolean;
  cmoHits?: { source: CmoSourceId; senaRole?: string; gvlList?: string }[];
  ejiHits?: unknown[];
}): string[] {
  const ids = new Set<string>();
  if (row.artisjusMatched) ids.add("hu.artisjus.unidentified_work");
  if (row.mlcMatchStatus === "unmatched") ids.add("us.mlc.unmatched_recording");
  if (row.mlcUnclaimed) ids.add("us.mlc.unclaimed_share");
  for (const hit of row.cmoHits ?? []) {
    for (const id of playbookIdsForCmoHitInternal(hit.source, hit)) ids.add(id);
  }
  if ((row.ejiHits?.length ?? 0) > 0) ids.add("hu.eji.unidentified");
  return [...ids];
}
