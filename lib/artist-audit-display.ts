import type { AuditRow } from "@/lib/types";
import { CMO_CHIP_LABELS, CMO_SOURCE_LABELS } from "@/lib/cmo-types";
import { CMO_WEB_LABELS } from "@/lib/cmo-web/web-types";
import { isUncertainNameMatch } from "@/lib/artist-name-match";

export function rowHasPayoutProblem(row: AuditRow): boolean {
  if (row.artisjusMatched) return true;
  if (row.mlcMatchStatus === "unmatched") return true;
  if (row.mlcUnclaimed) return true;
  if (row.cmoHits && row.cmoHits.length > 0) return true;
  if (row.cmoWebHits && row.cmoWebHits.length > 0) return true;
  if (row.ejiHits && row.ejiHits.length > 0) return true;
  return row.issues.some(
    (i) =>
      i.type === "artisjus_unmatched" ||
      i.type === "cmo_unmatched" ||
      i.type === "cmo_web_unidentified" ||
      i.type === "mlc_unclaimed_share" ||
      i.type === "no_mlc_match" ||
      i.type === "artisjus_foreign_only" ||
      i.type === "eji_unidentified",
  );
}

export function rowIsVisibleByDefault(query: string, row: AuditRow): boolean {
  return !isUncertainNameMatch(query, row.artist);
}

export function rowPayoutSummary(row: AuditRow): string {
  const parts: string[] = [];
  if (row.artisjusMatched) {
    parts.push("Magyarországon: nem tudták kinek kifizetni (ARTISJUS)");
  }
  if (row.mlcMatchStatus === "unmatched") {
    parts.push("USA: felvétel nincs műhöz párosítva (MLC unmatched)");
  }
  if (row.mlcUnclaimed) {
    const pct =
      row.mlcUnclaimedPct !== null && row.mlcUnclaimedPct !== undefined
        ? ` (${row.mlcUnclaimedPct}% unclaimed)`
        : "";
    parts.push(`USA: mechanikai share claim nélkül (MLC unclaimed${pct})`);
  }
  for (const hit of row.cmoHits ?? []) {
    parts.push(CMO_CHIP_LABELS[hit.source] ?? CMO_SOURCE_LABELS[hit.source]);
  }
  for (const hit of row.cmoWebHits ?? []) {
    parts.push(CMO_WEB_LABELS[hit.source]);
  }
  if (parts.length === 0 && row.issues.some((i) => i.severity === "critical")) {
    parts.push("Adathiány vagy hibás regisztráció");
  }
  if (parts.length === 0) return "Nincs ismert kifizetési gond ezeken a forrásokon.";
  return parts.join(" · ");
}

export function sortArtistAuditRows(rows: AuditRow[]): AuditRow[] {
  return [...rows].sort((a, b) => {
    const aProb = rowHasPayoutProblem(a) ? 0 : 1;
    const bProb = rowHasPayoutProblem(b) ? 0 : 1;
    if (aProb !== bProb) return aProb - bProb;
    const titleA = a.title ?? "";
    const titleB = b.title ?? "";
    return titleA.localeCompare(titleB, "hu", { sensitivity: "base" });
  });
}
