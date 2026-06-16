import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { computeAuditCountsFromRows } from "@/lib/artist-audit-filters";
import { getSourceDetailsForRow, laymanSummaryForRow } from "@/lib/artist-audit-row-details";
import { playbookIdForBlock, playbookIdsForRow } from "@/lib/recovery-mapper";
import { getPlaybook, toPlaybookSnapshot } from "@/lib/recovery-playbooks";
import type { ReportSnapshot, PublishedFinding, PublishedSourceBlock } from "@/lib/report-types";
import type { AuditRow, ArtistAuditMeta, AuditSummary } from "@/lib/types";

export function findingKeyForRow(row: AuditRow): string {
  return row.isrc?.trim() || `row:${(row.title ?? "unknown").slice(0, 80)}`;
}

export function buildReportSnapshot(input: {
  artistName: string;
  rows: AuditRow[];
  problemsOnly?: boolean;
}): ReportSnapshot {
  const problemsOnly = input.problemsOnly ?? true;
  const rows = problemsOnly ? input.rows.filter(rowHasPayoutProblem) : input.rows;

  const findings: PublishedFinding[] = rows.map((row) => {
    const sourceBlocks: PublishedSourceBlock[] = getSourceDetailsForRow(row).map((block) => {
      const playbookId = playbookIdForBlock(block, row);
      const entry = playbookId ? getPlaybook(playbookId) : undefined;
      return {
        ...block,
        playbookId: playbookId ?? null,
        playbookSnapshot: entry ? toPlaybookSnapshot(entry) : null,
      };
    });

    return {
      findingKey: findingKeyForRow(row),
      isrc: row.isrc,
      title: row.title,
      artist: row.artist,
      laymanSummary: laymanSummaryForRow(row),
      sourceBlocks,
      playbookIds: playbookIdsForRow(row),
    };
  });

  return {
    version: 1,
    artistName: input.artistName,
    generatedAt: new Date().toISOString(),
    problemsOnly,
    findings,
  };
}

export function buildPublishPayload(input: {
  artistName: string;
  scope: "top15" | "full";
  rows: AuditRow[];
  summary: AuditSummary;
  meta: ArtistAuditMeta;
  problemsOnly?: boolean;
  expiresAt?: string | null;
  supersedesReportId?: string | null;
}) {
  const problemsOnly = input.problemsOnly ?? true;
  const rows = problemsOnly ? input.rows.filter(rowHasPayoutProblem) : input.rows;
  const counts = computeAuditCountsFromRows(rows);
  const meta: ArtistAuditMeta = {
    ...input.meta,
    ...counts,
    isrcCount: rows.length,
  };

  return {
    artistDisplayName: input.artistName,
    auditScope: input.scope,
    meta,
    summary: input.summary,
    snapshot: buildReportSnapshot({
      artistName: input.artistName,
      rows: input.rows,
      problemsOnly,
    }),
    expiresAt: input.expiresAt ?? null,
    supersedesReportId: input.supersedesReportId ?? null,
  };
}
