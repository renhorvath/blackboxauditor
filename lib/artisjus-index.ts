import fs from "node:fs";
import path from "node:path";
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import type {
  ArtisjusArtistMatch,
  ArtisjusMatchResult,
  ArtisjusWork,
} from "@/lib/artisjus-types";

export type { ArtisjusArtistMatch, ArtisjusMatchResult, ArtisjusWork } from "@/lib/artisjus-types";
export { normalizeArtisjusText } from "@/lib/artisjus-normalize";

interface ArtisjusIndexFile {
  version: number;
  workCount: number;
  works: ArtisjusWork[];
  tokenIndex: Record<string, number[]>;
}

const STOP = new Set([
  "the", "and", "feat", "ft", "featuring", "a", "an", "az", "egy", "es", "is",
  "of", "in", "on", "de", "la", "le", "les", "el", "y", "vs", "mix", "remix",
]);

let cached: ArtisjusIndexFile | null = null;
let loadError: string | null = null;

function indexPath(): string {
  const fromEnv = process.env.ARTISJUS_INDEX_PATH?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "data", "artisjus-index.json");
}

export function artisjusIndexAvailable(): boolean {
  try {
    getArtisjusIndex();
    return true;
  } catch {
    return false;
  }
}

export function getArtisjusIndexLoadError(): string | null {
  return loadError;
}

function getArtisjusIndex(): ArtisjusIndexFile {
  if (cached) return cached;
  const file = indexPath();
  if (!fs.existsSync(file)) {
    loadError = `ARTISJUS index missing: ${file}. Run: npm run artisjus:build-index`;
    throw new Error(loadError);
  }
  const raw = fs.readFileSync(file, "utf-8");
  cached = JSON.parse(raw) as ArtisjusIndexFile;
  loadError = null;
  return cached;
}

export function artisjusTokens(value: string | null | undefined, minLen = 2): string[] {
  return normalizeArtisjusText(value)
    .split(" ")
    .filter((t) => t.length >= minLen && !STOP.has(t));
}

function scoreWork(
  work: ArtisjusWork,
  titleTokens: string[],
  artistTokens: string[],
): number {
  const titleBlob = new Set(artisjusTokens(`${work.mucim}`, 1));
  const artistBlob = new Set(artisjusTokens(`${work.eloadok} ${work.jogosultak}`, 1));

  let titleScore = 0;
  if (titleTokens.length > 0) {
    const hits = titleTokens.filter((t) => titleBlob.has(t)).length;
    titleScore = hits / titleTokens.length;
  }

  let artistScore = 0;
  if (artistTokens.length > 0) {
    const hits = artistTokens.filter((t) => artistBlob.has(t)).length;
    artistScore = hits / artistTokens.length;
  }

  if (titleTokens.length === 0 && artistTokens.length > 0) {
    return artistScore;
  }
  if (artistTokens.length === 0) {
    return titleScore;
  }
  return titleScore * 0.72 + artistScore * 0.28;
}

function candidateIndices(
  index: ArtisjusIndexFile,
  titleTokens: string[],
  artistTokens: string[],
): number[] {
  const queryTokens = [...new Set([...titleTokens, ...artistTokens])].sort(
    (a, b) => (index.tokenIndex[a]?.length ?? 999999) - (index.tokenIndex[b]?.length ?? 999999),
  );

  if (queryTokens.length === 0) return [];

  let pool: Set<number> | null = null;
  for (const tok of queryTokens.slice(0, 6)) {
    const hits = index.tokenIndex[tok];
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
    for (const idx of index.tokenIndex[tok] ?? []) fallback.add(idx);
  }
  return [...fallback];
}

export function matchArtisjusTrack(
  title: string | null | undefined,
  artist: string | null | undefined,
): ArtisjusMatchResult {
  const index = getArtisjusIndex();
  const titleTokens = artisjusTokens(title, 2);
  const artistTokens = artisjusTokens(artist, 2);

  if (titleTokens.length === 0 && artistTokens.length === 0) {
    return { matched: false, score: 0 };
  }

  const candidates = candidateIndices(index, titleTokens, artistTokens);
  if (candidates.length === 0) {
    return { matched: false, score: 0 };
  }

  let best: ArtisjusWork | undefined;
  let bestScore = 0;

  for (const idx of candidates.slice(0, 400)) {
    const work = index.works[idx];
    if (!work) continue;
    const score = scoreWork(work, titleTokens, artistTokens);
    if (score > bestScore) {
      bestScore = score;
      best = work;
    }
  }

  const threshold =
    titleTokens.length >= 2 ? 0.55 : titleTokens.length === 1 ? 0.85 : 0.6;

  if (!best || bestScore < threshold) {
    return { matched: false, score: bestScore };
  }

  return { matched: true, score: bestScore, work: best };
}

export function searchArtisjusByArtist(
  artist: string | null | undefined,
  limit = 150,
): ArtisjusArtistMatch[] {
  const index = getArtisjusIndex();
  const artistTokens = artisjusTokens(artist, 2);
  if (artistTokens.length === 0) return [];

  const threshold =
    artistTokens.length >= 2 ? 0.55 : artistTokens.length === 1 ? 0.75 : 0.6;

  const candidates = candidateIndices(index, [], artistTokens);
  const scored: ArtisjusArtistMatch[] = [];

  for (const idx of candidates.slice(0, 3000)) {
    const work = index.works[idx];
    if (!work) continue;
    const score = scoreWork(work, [], artistTokens);
    if (score >= threshold) {
      scored.push({ work, score });
    }
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

export function getArtisjusWorkCount(): number {
  return getArtisjusIndex().workCount;
}
