import { dbConfigured, getDb } from "@/lib/db";
import type { LandingTeaserResult } from "@/lib/landing-teaser";

/** Bump when the teaser payload shape changes so stale rows are not reused. */
const CACHE_VERSION = "v1";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type LandingSearchStatus = LandingTeaserResult["status"] | "error";

export interface LandingSearchEvent {
  queryRaw: string;
  queryNorm: string;
  status: LandingSearchStatus;
  cacheHit: boolean;
  durationMs: number;
  societies: number;
  totalItems: number;
  countries: number;
}

let schemaReady = false;

export function normalizeLandingQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLocaleLowerCase("hu").slice(0, 200);
}

export function landingCacheKey(queryNorm: string): string {
  return `${CACHE_VERSION}:${queryNorm}`;
}

export async function ensureLandingSearchSchema(): Promise<void> {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS landing_searches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      query_raw TEXT NOT NULL,
      query_norm TEXT NOT NULL,
      status TEXT NOT NULL,
      cache_hit BOOLEAN NOT NULL DEFAULT false,
      duration_ms INT NOT NULL,
      societies INT NOT NULL DEFAULT 0,
      total_items INT NOT NULL DEFAULT 0,
      countries INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS landing_searches_created_at_idx ON landing_searches (created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS landing_searches_query_norm_idx ON landing_searches (query_norm)`;
  await sql`
    CREATE TABLE IF NOT EXISTS landing_search_cache (
      query_norm TEXT PRIMARY KEY,
      query_raw TEXT NOT NULL,
      result JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
}

async function ready(): Promise<boolean> {
  if (!dbConfigured()) return false;
  if (!schemaReady) {
    await ensureLandingSearchSchema();
    schemaReady = true;
  }
  return true;
}

function isLandingTeaserResult(value: unknown): value is LandingTeaserResult {
  if (!value || typeof value !== "object") return false;
  const v = value as LandingTeaserResult;
  return (
    (v.status === "found" || v.status === "none" || v.status === "unavailable") &&
    typeof v.resolvedName === "string" &&
    Array.isArray(v.groups) &&
    typeof v.summary?.totalItems === "number"
  );
}

export async function readLandingSearchCache(
  queryNorm: string,
): Promise<LandingTeaserResult | null> {
  if (!(await ready())) return null;
  const sql = getDb();
  const key = landingCacheKey(queryNorm);
  const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();
  const rows = (await sql`
    SELECT result
    FROM landing_search_cache
    WHERE query_norm = ${key}
      AND fetched_at > ${cutoff}::timestamptz
    LIMIT 1
  `) as { result: unknown }[];
  const row = rows[0];
  if (!row || !isLandingTeaserResult(row.result)) return null;
  if (row.result.status === "unavailable") return null;
  return row.result;
}

export async function upsertLandingSearchCache(
  queryRaw: string,
  queryNorm: string,
  result: LandingTeaserResult,
): Promise<void> {
  if (result.status === "unavailable") return;
  if (!(await ready())) return;
  const sql = getDb();
  const key = landingCacheKey(queryNorm);
  await sql`
    INSERT INTO landing_search_cache (query_norm, query_raw, result, fetched_at)
    VALUES (
      ${key},
      ${queryRaw.slice(0, 200)},
      ${JSON.stringify(result)}::jsonb,
      now()
    )
    ON CONFLICT (query_norm) DO UPDATE SET
      query_raw = EXCLUDED.query_raw,
      result = EXCLUDED.result,
      fetched_at = EXCLUDED.fetched_at
  `;
}

export async function insertLandingSearch(event: LandingSearchEvent): Promise<void> {
  if (!(await ready())) return;
  const sql = getDb();
  await sql`
    INSERT INTO landing_searches (
      query_raw, query_norm, status, cache_hit, duration_ms,
      societies, total_items, countries
    )
    VALUES (
      ${event.queryRaw.slice(0, 200)},
      ${event.queryNorm},
      ${event.status},
      ${event.cacheHit},
      ${event.durationMs},
      ${event.societies},
      ${event.totalItems},
      ${event.countries}
    )
  `;
}

export async function persistLandingSearch(input: {
  event: LandingSearchEvent;
  result?: LandingTeaserResult;
}): Promise<void> {
  await insertLandingSearch(input.event);
  if (input.result && !input.event.cacheHit) {
    await upsertLandingSearchCache(
      input.event.queryRaw,
      input.event.queryNorm,
      input.result,
    );
  }
}
