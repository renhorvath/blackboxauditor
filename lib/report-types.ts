import type { GapBadge, GapKind, GapPriority } from "@/lib/audit-core/gap-types";
import type { ArtistAuditMeta, ArtistAuditScope, AuditSummary } from "@/lib/types";
import type { SourceDetailBlock } from "@/lib/artist-audit-row-details";
import type { PlaybookSnapshot } from "@/lib/recovery-types";

/** sessionStorage key for the operator secret — shared by the homepage console and /admin/reports. */
export const OPERATOR_SECRET_STORAGE_KEY = "bbox-operator-secret";

export interface PublishedSourceBlock extends SourceDetailBlock {
  playbookId?: string | null;
  playbookSnapshot?: PlaybookSnapshot | null;
}

export interface PublishedFinding {
  findingKey: string;
  isrc: string;
  title: string | null;
  artist: string | null;
  laymanSummary: string;
  /** Snapshot at publish time — max 2 chips shown in UI. */
  gapBadges?: GapBadge[];
  /** Top gap at publish — Sprint 5 snapshot fields. */
  gapPriority?: GapPriority;
  primaryGapKind?: GapKind;
  gapCatalogHint?: string;
  sourceBlocks: PublishedSourceBlock[];
  playbookIds: string[];
}

export interface ReportSnapshot {
  version: 1;
  artistName: string;
  generatedAt: string;
  problemsOnly: boolean;
  findings: PublishedFinding[];
}

export interface PublishedReportPayload {
  token: string;
  artistDisplayName: string;
  publishedAt: string;
  auditScope: ArtistAuditScope;
  meta: ArtistAuditMeta;
  summary: AuditSummary;
  snapshot: ReportSnapshot;
  expiresAt: string | null;
  revokedAt: string | null;
  supersedesReportId: string | null;
  reportId: string;
}

export interface PublishReportInput {
  artistDisplayName: string;
  auditScope: ArtistAuditScope;
  meta: ArtistAuditMeta;
  summary: AuditSummary;
  snapshot: ReportSnapshot;
  expiresAt?: string | null;
  supersedesReportId?: string | null;
}

export type CaseFindingStatus =
  | "open"
  | "in_progress"
  | "submitted"
  | "resolved"
  | "not_applicable";

export interface CaseFindingRow {
  id: string;
  reportId: string;
  findingKey: string;
  playbookId: string;
  status: CaseFindingStatus;
  stepProgress: Record<string, "done" | "pending">;
  operatorNotes: string | null;
  publicNote: string | null;
  updatedAt: string;
}

export interface AdminReportListItem {
  id: string;
  token: string;
  artistDisplayName: string;
  publishedAt: string;
  auditScope: string;
  findingCount: number;
  revokedAt: string | null;
  supersedesReportId: string | null;
}
