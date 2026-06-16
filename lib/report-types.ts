import type { ArtistAuditMeta, ArtistAuditScope, AuditSummary } from "@/lib/types";
import type { SourceDetailBlock } from "@/lib/artist-audit-row-details";
import type { PlaybookSnapshot } from "@/lib/recovery-types";

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
