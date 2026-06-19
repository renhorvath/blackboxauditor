/** Gap kinds for A (catalog) × B (black box) cross-check — see docs/ui_ab_roadmap.md */

export type GapPriority = "P0" | "P1" | "P2";

export type GapKind =
  | "blackbox_only"
  | "listed_and_registered"
  | "missing_iswc"
  | "missing_ipi"
  | "share_incomplete"
  | "name_only_match"
  | "catalog_clean";

export type GapConfidence = "high" | "fuzzy" | "wizard";

export interface GapBadge {
  kind: GapKind;
  priority: GapPriority;
  label: string;
  catalogHint?: string;
  confidence: GapConfidence;
}
