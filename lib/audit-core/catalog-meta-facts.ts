import type { AuditRow } from "@/lib/types";
import { deriveGapBadges } from "@/lib/audit-core/derive-gap-badges";
import { isSyntheticAuditIsrc } from "@/lib/types";

export interface CatalogMetaFact {
  label: string;
  value: string;
}

/** Ops-only metaadat blokk — A oldal jelzései egy sorhoz. */
export function catalogMetaFactsForRow(row: AuditRow, queryArtistName?: string): CatalogMetaFact[] {
  const facts: CatalogMetaFact[] = [];

  if (row.isrc && !isSyntheticAuditIsrc(row.isrc)) {
    facts.push({ label: "ISRC", value: row.isrc });
  }
  facts.push({ label: "ISWC", value: row.iswc?.trim() || "—" });
  facts.push({ label: "MLC státusz", value: row.mlcMatchStatus });
  if (row.shareStatus) {
    facts.push({ label: "Share", value: row.shareStatus });
  }

  const badges = deriveGapBadges(row, queryArtistName);
  if (badges.length > 0) {
    facts.push({
      label: "Gap",
      value: badges.map((b) => `${b.label} (${b.priority}, ${b.confidence})`).join("; "),
    });
  }

  const criticalIssues = row.issues
    .filter((i) => i.severity === "critical" || i.severity === "warning")
    .map((i) => i.type);
  if (criticalIssues.length > 0) {
    facts.push({ label: "Issue típusok", value: criticalIssues.join(", ") });
  }

  return facts;
}
