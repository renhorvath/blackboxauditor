import fs from "node:fs";
import path from "node:path";
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import type {
  CmoArtistMatch,
  CmoIndexFile,
  CmoRecord,
  CmoSourceId,
} from "@/lib/cmo-types";
import { CMO_SOURCE_IDS } from "@/lib/cmo-types";

export type { CmoArtistMatch, CmoRecord, CmoSourceId } from "@/lib/cmo-types";

const STOP = new Set([
  "the", "and", "feat", "ft", "featuring", "a", "an", "az", "egy", "es", "is",
  "of", "in", "on", "de", "la", "le", "les", "el", "y", "vs", "mix", "remix",
]);

let cached: CmoIndexFile | null = null;
let loadError: string | null = null;

function indexPath(): string {
  const fromEnv = process.env.CMO_INDEX_PATH?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "data", "cmo-index.json");
}

export function cmoIndexAvailable(): boolean {
  try {
    getCmoIndex();
    return true;
  } catch {
    return false;
  }
}

export function cmoIndexFileExists(): boolean {
  return fs.existsSync(indexPath());
}

export function getCmoIndexLoadError(): string | null {
  return loadError;
}

function getCmoIndex(): CmoIndexFile {
  if (cached) return cached;
  const file = indexPath();
  if (!fs.existsSync(file)) {
    loadError = `CMO index missing: ${file}. Run: npm run cmo:build-index`;
    throw new Error(loadError);
  }
  cached = JSON.parse(fs.readFileSync(file, "utf-8")) as CmoIndexFile;
  loadError = null;
  return cached;
}

function cmoTokens(value: string | null | undefined, minLen = 2): string[] {
  return normalizeArtisjusText(value)
    .split(" ")
    .filter((t) => t.length >= minLen && !STOP.has(t));
}

function candidateIndices(
  tokenIndex: Record<string, number[]>,
  tokens: string[],
): number[] {
  const queryTokens = [...new Set(tokens)].sort(
    (a, b) => (tokenIndex[a]?.length ?? 999999) - (tokenIndex[b]?.length ?? 999999),
  );
  if (queryTokens.length === 0) return [];

  let pool: Set<number> | null = null;
  for (const tok of queryTokens.slice(0, 6)) {
    const hits = tokenIndex[tok];
    if (!hits?.length) continue;
    if (!pool) {
      pool = new Set(hits);
      continue;
    }
    const next = new Set<number>();
    for (const idx of hits) {
      if (pool.has(idx)) next.add(idx);
    }
    pool = next;
    if (pool.size === 0) break;
  }

  if (pool && pool.size > 0) return [...pool];

  const fallback = new Set<number>();
  for (const tok of queryTokens.slice(0, 4)) {
    for (const idx of tokenIndex[tok] ?? []) fallback.add(idx);
  }
  return [...fallback];
}

function scoreRecord(record: CmoRecord, artistTokens: string[]): number {
  const blob = new Set(
    cmoTokens(
      `${record.identification} ${record.title} ${record.performer ?? ""} ${record.composer ?? ""}`,
      1,
    ),
  );
  if (artistTokens.length === 0) return 0;
  const hits = artistTokens.filter((t) => blob.has(t)).length;
  return hits / artistTokens.length;
}

export function searchCmoByArtist(
  artist: string | null | undefined,
  options?: { source?: CmoSourceId; limit?: number },
): CmoArtistMatch[] {
  const index = getCmoIndex();
  const artistTokens = cmoTokens(artist, 2);
  if (artistTokens.length === 0) return [];

  const threshold =
    artistTokens.length >= 2 ? 0.55 : artistTokens.length === 1 ? 0.75 : 0.6;
  const limit = options?.limit ?? 80;
  const sourceIds = options?.source
    ? [options.source]
    : (Object.keys(index.sources) as CmoSourceId[]);

  const all: CmoArtistMatch[] = [];

  for (const sourceId of sourceIds) {
    const src = index.sources[sourceId];
    if (!src) continue;
    const candidates = candidateIndices(src.tokenIndex, artistTokens);
    for (const idx of candidates.slice(0, 2000)) {
      const record = src.records[idx];
      if (!record) continue;
      const score = scoreRecord(record, artistTokens);
      if (score >= threshold) {
        all.push({ record, score });
      }
    }
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

export function searchCmoByIsrc(isrc: string | null | undefined): CmoArtistMatch[] {
  if (!isrc?.trim()) return [];
  const norm = isrc.trim().toUpperCase();
  const index = getCmoIndex();
  const out: CmoArtistMatch[] = [];

  for (const sourceId of CMO_SOURCE_IDS) {
    const src = index.sources[sourceId];
    if (!src) continue;
    for (const record of src.records) {
      if (record.isrc?.toUpperCase() === norm) {
        out.push({ record, score: 1 });
      }
    }
  }

  return out;
}

export function getCmoSourceCounts(): Partial<Record<CmoSourceId, number>> {
  const index = getCmoIndex();
  const counts: Partial<Record<CmoSourceId, number>> = {};
  for (const [id, src] of Object.entries(index.sources)) {
    counts[id as CmoSourceId] = src.recordCount;
  }
  return counts;
}
