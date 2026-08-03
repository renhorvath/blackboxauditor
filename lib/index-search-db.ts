import type { ArtisjusArtistMatch, ArtisjusWork } from "@/lib/artisjus-types";
import type { CmoArtistMatch, CmoRecord, CmoSourceId } from "@/lib/cmo-types";
import { indexQuery } from "@/lib/index-db";
import { indexDbConfigured } from "@/lib/index-db-config";
import {
  artistMatchThreshold,
  cmoArtistScoreBlob,
  indexTokens,
  uniqueTokens,
} from "@/lib/index-tokens";

export function indexSearchAvailable(): boolean {
  return indexDbConfigured();
}

function scoreArtisjusArtist(work: ArtisjusWork, artistTokens: string[]): number {
  const blob = new Set(indexTokens(`${work.eloadok} ${work.jogosultak}`, 1));
  if (artistTokens.length === 0) return 0;
  return artistTokens.filter((t) => blob.has(t)).length / artistTokens.length;
}

function scoreCmoArtist(record: CmoRecord, artistTokens: string[]): number {
  const blob = new Set(indexTokens(cmoArtistScoreBlob(record), 1));
  if (artistTokens.length === 0) return 0;
  return artistTokens.filter((t) => blob.has(t)).length / artistTokens.length;
}

/**
 * One round-trip for ARTISJUS: GIN overlap, prefer full-token matches, then JS score.
 */
export async function searchArtisjusByArtistDb(
  artist: string | null | undefined,
  limit = 150,
): Promise<ArtisjusArtistMatch[]> {
  const artistTokens = uniqueTokens(artist, 2);
  if (artistTokens.length === 0) return [];

  const threshold = artistMatchThreshold(artistTokens.length);
  const candidateLimit = 1500;
  const minHits =
    artistTokens.length <= 1 ? 1 : Math.max(1, artistTokens.length - 1);

  const rows = await indexQuery<{ record: ArtisjusWork }>(
    `SELECT record
     FROM meder.artisjus_works
     WHERE search_tokens && $1::text[]
       AND (
         SELECT count(*)::int
         FROM unnest($1::text[]) AS q(tok)
         WHERE q.tok = ANY (search_tokens)
       ) >= $3
     ORDER BY (search_tokens @> $1::text[]) DESC
     LIMIT $2`,
    [artistTokens, candidateLimit, minHits],
  );

  const scored: ArtisjusArtistMatch[] = [];
  for (const row of rows) {
    const work = row.record;
    const score = scoreArtisjusArtist(work, artistTokens);
    if (score >= threshold) scored.push({ work, score });
  }

  scored.sort((a, b) => b.score - a.score || a.work.mucim.localeCompare(b.work.mucim, "hu"));

  const seen = new Set<string>();
  const out: ArtisjusArtistMatch[] = [];
  for (const hit of scored) {
    if (seen.has(hit.work.mukod)) continue;
    seen.add(hit.work.mukod);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * One round-trip for CMO (+ GVL): LATERAL keeps per-source fairness
 * (same spirit as the old per-source loop) without N network round-trips.
 */
export async function searchCmoByArtistDb(
  artist: string | null | undefined,
  options?: { source?: CmoSourceId; limit?: number },
): Promise<CmoArtistMatch[]> {
  const artistTokens = uniqueTokens(artist, 2);
  if (artistTokens.length === 0) return [];

  const threshold = artistMatchThreshold(artistTokens.length);
  const limit = options?.limit ?? 80;
  const perSourceLimit = 500;
  // Slightly loose vs JS threshold so edge cases still reach scoring
  // (JS uses minLen=1 tokens on the blob; stored index is minLen=2).
  const minHits =
    artistTokens.length <= 1 ? 1 : Math.max(1, artistTokens.length - 1);

  const rows = options?.source
    ? await indexQuery<{ record: CmoRecord }>(
        `SELECT record
         FROM meder.cmo_records
         WHERE source = $2
           AND search_tokens && $1::text[]
           AND (
             SELECT count(*)::int
             FROM unnest($1::text[]) AS q(tok)
             WHERE q.tok = ANY (search_tokens)
           ) >= $4
         ORDER BY (search_tokens @> $1::text[]) DESC
         LIMIT $3`,
        [artistTokens, options.source, perSourceLimit, minHits],
      )
    : await indexQuery<{ record: CmoRecord }>(
        `SELECT x.record
         FROM meder.index_meta AS m
         CROSS JOIN LATERAL (
           SELECT r.record
           FROM meder.cmo_records AS r
           WHERE r.source = m.source
             AND r.search_tokens && $1::text[]
             AND (
               SELECT count(*)::int
               FROM unnest($1::text[]) AS q(tok)
               WHERE q.tok = ANY (r.search_tokens)
             ) >= $3
           ORDER BY (r.search_tokens @> $1::text[]) DESC
           LIMIT $2
         ) AS x
         WHERE m.source <> 'artisjus'`,
        [artistTokens, perSourceLimit, minHits],
      );

  const all: CmoArtistMatch[] = [];
  for (const row of rows) {
    const record = row.record;
    const score = scoreCmoArtist(record, artistTokens);
    if (score >= threshold) all.push({ record, score });
  }

  all.sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title, "en"));

  const seen = new Set<string>();
  const out: CmoArtistMatch[] = [];
  for (const hit of all) {
    const key = `${hit.record.source}:${hit.record.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
    if (out.length >= limit) break;
  }
  return out;
}

export async function indexMetaSummary(): Promise<
  { source: string; recordCount: number; builtAt: string | null; loadedAt: string }[]
> {
  return indexQuery(
    `SELECT source, record_count AS "recordCount",
            built_at AS "builtAt", loaded_at AS "loadedAt"
     FROM meder.index_meta ORDER BY source`,
  );
}
