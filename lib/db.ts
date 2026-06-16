import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sql: NeonQueryFunction<false, false> | null = null;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDb(): NeonQueryFunction<false, false> {
  if (!sql) {
    const url = process.env.DATABASE_URL?.trim();
    if (!url) throw new Error("DATABASE_URL is not configured");
    sql = neon(url);
  }
  return sql;
}

export const REPORTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  artist_display_name TEXT NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audit_scope TEXT NOT NULL DEFAULT 'top15',
  meta JSONB NOT NULL DEFAULT '{}',
  summary JSONB NOT NULL DEFAULT '{}',
  snapshot JSONB NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  supersedes_report_id UUID NULL REFERENCES reports(id)
);

CREATE INDEX IF NOT EXISTS reports_published_at_idx ON reports (published_at DESC);
CREATE INDEX IF NOT EXISTS reports_artist_idx ON reports (artist_display_name);

CREATE TABLE IF NOT EXISTS case_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  finding_key TEXT NOT NULL,
  playbook_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  step_progress JSONB NOT NULL DEFAULT '{}',
  operator_notes TEXT NULL,
  public_note TEXT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (report_id, finding_key, playbook_id)
);

CREATE INDEX IF NOT EXISTS case_findings_report_idx ON case_findings (report_id);
`;

export async function ensureSchema(): Promise<void> {
  const q = getDb();
  await q`
    CREATE TABLE IF NOT EXISTS reports (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token TEXT NOT NULL UNIQUE,
      artist_display_name TEXT NOT NULL,
      published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      audit_scope TEXT NOT NULL DEFAULT 'top15',
      meta JSONB NOT NULL DEFAULT '{}',
      summary JSONB NOT NULL DEFAULT '{}',
      snapshot JSONB NOT NULL DEFAULT '{}',
      expires_at TIMESTAMPTZ NULL,
      revoked_at TIMESTAMPTZ NULL,
      supersedes_report_id UUID NULL REFERENCES reports(id)
    )
  `;
  await q`CREATE INDEX IF NOT EXISTS reports_published_at_idx ON reports (published_at DESC)`;
  await q`CREATE INDEX IF NOT EXISTS reports_artist_idx ON reports (artist_display_name)`;
  await q`
    CREATE TABLE IF NOT EXISTS case_findings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      finding_key TEXT NOT NULL,
      playbook_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      step_progress JSONB NOT NULL DEFAULT '{}',
      operator_notes TEXT NULL,
      public_note TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (report_id, finding_key, playbook_id)
    )
  `;
  await q`CREATE INDEX IF NOT EXISTS case_findings_report_idx ON case_findings (report_id)`;
}
