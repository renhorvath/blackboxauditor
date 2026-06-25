import { dbConfigured, getDb } from "@/lib/db";

export interface LeadInput {
  email: string;
  searchedName?: string | null;
  source?: string;
  meta?: Record<string, unknown>;
}

export interface LeadRecord {
  id: string;
  email: string;
  searchedName: string | null;
  source: string;
  createdAt: string;
}

type LeadDbRow = {
  id: string;
  email: string;
  searched_name: string | null;
  source: string;
  created_at: string;
};

let schemaReady = false;

export async function ensureLeadsSchema(): Promise<void> {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL,
      searched_name TEXT NULL,
      source TEXT NOT NULL DEFAULT 'landing',
      meta JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (email)`;
}

export async function insertLead(input: LeadInput): Promise<LeadRecord> {
  if (!dbConfigured()) throw new Error("DATABASE_URL is not configured");
  if (!schemaReady) {
    await ensureLeadsSchema();
    schemaReady = true;
  }
  const sql = getDb();
  const meta = input.meta ?? {};
  const rows = (await sql`
    INSERT INTO leads (email, searched_name, source, meta)
    VALUES (
      ${input.email},
      ${input.searchedName ?? null},
      ${input.source ?? "landing"},
      ${JSON.stringify(meta)}::jsonb
    )
    RETURNING id, email, searched_name, source, created_at
  `) as LeadDbRow[];
  const row = rows[0]!;
  return {
    id: row.id,
    email: row.email,
    searchedName: row.searched_name,
    source: row.source,
    createdAt: row.created_at,
  };
}
