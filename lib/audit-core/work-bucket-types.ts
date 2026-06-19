import type { GapBadge } from "@/lib/audit-core/gap-types";
import type { AuditRow } from "@/lib/types";

/** Grouping lens — see docs/ui_ab_roadmap.md Sprint 3. */
export type AuditLensId = "findings" | "by_work" | "catalog";

export interface WorkBucket {
  workKey: string;
  title: string;
  iswc: string | null;
  recordings: AuditRow[];
  /** Highest-priority gap across recordings in this bucket. */
  primaryGap: GapBadge | null;
  hasPayoutProblem: boolean;
}
