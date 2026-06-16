import { randomBytes } from "node:crypto";
import { dbConfigured, ensureSchema, getDb } from "@/lib/db";
import type {
  AdminReportListItem,
  CaseFindingRow,
  CaseFindingStatus,
  PublishReportInput,
  PublishedReportPayload,
  ReportSnapshot,
} from "@/lib/report-types";
import type { ArtistAuditMeta, AuditSummary } from "@/lib/types";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

type ReportRow = {
  id: string;
  token: string;
  artist_display_name: string;
  published_at: string;
  audit_scope: string;
  meta: ArtistAuditMeta;
  summary: AuditSummary;
  snapshot: ReportSnapshot;
  expires_at: string | null;
  revoked_at: string | null;
  supersedes_report_id: string | null;
};

function mapReport(row: ReportRow): PublishedReportPayload {
  return {
    reportId: row.id,
    token: row.token,
    artistDisplayName: row.artist_display_name,
    publishedAt: row.published_at,
    auditScope: row.audit_scope as "top15" | "full",
    meta: row.meta,
    summary: row.summary,
    snapshot: row.snapshot,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    supersedesReportId: row.supersedes_report_id,
  };
}

export async function publishReport(input: PublishReportInput): Promise<PublishedReportPayload> {
  await ensureSchema();
  const sql = getDb();
  const token = generateToken();
  const rows = await sql`
    INSERT INTO reports (
      token, artist_display_name, audit_scope, meta, summary, snapshot,
      expires_at, supersedes_report_id
    ) VALUES (
      ${token},
      ${input.artistDisplayName},
      ${input.auditScope},
      ${JSON.stringify(input.meta)}::jsonb,
      ${JSON.stringify(input.summary)}::jsonb,
      ${JSON.stringify(input.snapshot)}::jsonb,
      ${input.expiresAt ?? null},
      ${input.supersedesReportId ?? null}
    )
    RETURNING *
  `;
  const row = rows[0] as ReportRow;
  const report = mapReport(row);

  for (const finding of input.snapshot.findings) {
    for (const block of finding.sourceBlocks) {
      const playbookId = block.playbookId;
      if (!playbookId) continue;
      await sql`
        INSERT INTO case_findings (report_id, finding_key, playbook_id, status)
        VALUES (${report.reportId}, ${finding.findingKey}, ${playbookId}, 'open')
        ON CONFLICT (report_id, finding_key, playbook_id) DO NOTHING
      `;
    }
  }

  return report;
}

export async function getReportByToken(token: string): Promise<PublishedReportPayload | null> {
  if (!dbConfigured()) return null;
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM reports
    WHERE token = ${token}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1
  `;
  if (!rows.length) return null;
  return mapReport(rows[0] as ReportRow);
}

export async function revokeReport(reportId: string): Promise<boolean> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`
    UPDATE reports SET revoked_at = now() WHERE id = ${reportId}::uuid AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export async function listReports(): Promise<AdminReportListItem[]> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`
    SELECT id, token, artist_display_name, published_at, audit_scope,
           revoked_at, supersedes_report_id,
           jsonb_array_length(COALESCE(snapshot->'findings', '[]'::jsonb)) AS finding_count
    FROM reports
    ORDER BY published_at DESC
    LIMIT 200
  `;
  return (rows as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    token: String(r.token),
    artistDisplayName: String(r.artist_display_name),
    publishedAt: String(r.published_at),
    auditScope: String(r.audit_scope),
    findingCount: Number(r.finding_count ?? 0),
    revokedAt: r.revoked_at ? String(r.revoked_at) : null,
    supersedesReportId: r.supersedes_report_id ? String(r.supersedes_report_id) : null,
  }));
}

export async function getCaseFindings(reportId: string): Promise<CaseFindingRow[]> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM case_findings WHERE report_id = ${reportId}::uuid ORDER BY finding_key, playbook_id
  `;
  return (rows as Array<Record<string, unknown>>).map(mapCaseFinding);
}

export async function getCaseFindingsByToken(token: string): Promise<CaseFindingRow[]> {
  const report = await getReportByToken(token);
  if (!report) return [];
  return getCaseFindings(report.reportId);
}

function mapCaseFinding(r: Record<string, unknown>): CaseFindingRow {
  return {
    id: String(r.id),
    reportId: String(r.report_id),
    findingKey: String(r.finding_key),
    playbookId: String(r.playbook_id),
    status: r.status as CaseFindingStatus,
    stepProgress: (r.step_progress as Record<string, "done" | "pending">) ?? {},
    operatorNotes: r.operator_notes ? String(r.operator_notes) : null,
    publicNote: r.public_note ? String(r.public_note) : null,
    updatedAt: String(r.updated_at),
  };
}

export async function upsertCaseFinding(input: {
  reportId: string;
  findingKey: string;
  playbookId: string;
  status: CaseFindingStatus;
  stepProgress: Record<string, "done" | "pending">;
  operatorNotes: string | null;
  publicNote: string | null;
}): Promise<CaseFindingRow> {
  await ensureSchema();
  const sql = getDb();
  const rows = await sql`
    INSERT INTO case_findings (
      report_id, finding_key, playbook_id, status, step_progress, operator_notes, public_note, updated_at
    ) VALUES (
      ${input.reportId}::uuid,
      ${input.findingKey},
      ${input.playbookId},
      ${input.status},
      ${JSON.stringify(input.stepProgress)}::jsonb,
      ${input.operatorNotes},
      ${input.publicNote},
      now()
    )
    ON CONFLICT (report_id, finding_key, playbook_id) DO UPDATE SET
      status = EXCLUDED.status,
      step_progress = EXCLUDED.step_progress,
      operator_notes = EXCLUDED.operator_notes,
      public_note = EXCLUDED.public_note,
      updated_at = now()
    RETURNING *
  `;
  return mapCaseFinding(rows[0] as Record<string, unknown>);
}

export function publishApiKeyValid(header: string | null): boolean {
  const expected = process.env.PUBLISH_API_KEY?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  if (!header) return false;
  return header === `Bearer ${expected}` || header === expected;
}

export function operatorAuthValid(header: string | null): boolean {
  const expected = process.env.OPERATOR_SECRET?.trim();
  if (!expected) return process.env.NODE_ENV !== "production";
  if (!header) return false;
  return header === `Bearer ${expected}` || header === expected;
}
