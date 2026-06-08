import type { AuditRow } from "@/lib/types";

export function rowHasPayoutProblem(row: AuditRow): boolean {
  if (row.artisjusMatched) return true;
  if (row.mlcMatchStatus === "unmatched") return true;
  return row.issues.some(
    (i) =>
      i.type === "artisjus_unmatched" ||
      i.type === "no_mlc_match" ||
      i.type === "artisjus_foreign_only",
  );
}

export function rowPayoutSummary(row: AuditRow): string {
  const parts: string[] = [];
  if (row.artisjusMatched) {
    parts.push("Magyarországon: nem tudták kinek kifizetni (ARTISJUS)");
  }
  if (row.mlcMatchStatus === "unmatched") {
    parts.push("USA-ban: összegyűjtötték, de nincs jogosult (MLC)");
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
