import type { AuditRow } from "@/lib/types";
import { CMO_SOURCE_LABELS } from "@/lib/cmo-types";
import type { CmoSourceId } from "@/lib/cmo-types";

export function rowHasPayoutProblem(row: AuditRow): boolean {
  if (row.artisjusMatched) return true;
  if (row.mlcMatchStatus === "unmatched") return true;
  if (row.mlcUnclaimed) return true;
  if (row.cmoHits && row.cmoHits.length > 0) return true;
  return row.issues.some(
    (i) =>
      i.type === "artisjus_unmatched" ||
      i.type === "cmo_unmatched" ||
      i.type === "mlc_unclaimed_share" ||
      i.type === "no_mlc_match" ||
      i.type === "artisjus_foreign_only",
  );
}

const CMO_SUMMARY: Record<CmoSourceId, string> = {
  "at-akm": "Ausztria (AKM): azonosítatlan mű",
  "at-aume": "Ausztria (AUME): mechanikai jog nem claimelt",
  "nl-sena": "Hollandia (SENA): külföldi felvétel nem claimelt",
};

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
    parts.push(CMO_SUMMARY[hit.source] ?? CMO_SOURCE_LABELS[hit.source]);
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
