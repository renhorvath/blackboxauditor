import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ejiFormPost } from "@/lib/cmo-web/eji-client";
import { parseEjiArtistHits, parseEjiTrackHits } from "@/lib/cmo-web/eji-parse";
import type { EjiSearchResult } from "@/lib/cmo-web/eji-types";
import {
  EJI_ARTIST_SEARCH_URL,
  EJI_TRACK_SEARCH_URL,
} from "@/lib/cmo-web/eji-types";
import {
  artistMatchThreshold,
  scoreArtistNameMatch,
  uniqueTokens,
} from "@/lib/index-tokens";
import { isServerlessRuntime } from "@/lib/runtime-env";

/** Bump when match rules change so stale /tmp caches are not reused. */
const EJI_CACHE_VERSION = "v2";

const CACHE_DIR = isServerlessRuntime()
  ? path.join("/tmp", "cmo-web-cache", "eji")
  : path.join(process.cwd(), "derived", "cmo-web-cache", "eji");

function cachePath(query: string): string {
  const hash = createHash("sha256")
    .update(`${EJI_CACHE_VERSION}:${query.toLowerCase()}`)
    .digest("hex")
    .slice(0, 16);
  return path.join(CACHE_DIR, `${hash}.json`);
}

/**
 * Strict artist match — same rules as CMO scoring:
 * all query tokens must appear, extra name tokens are penalized
 * ("Eyal Golan" must not match query "Golan").
 */
export function ejiArtistMatchesQuery(mainArtist: string, query: string): boolean {
  const queryTokens = uniqueTokens(query, 2);
  if (queryTokens.length === 0) return true;
  const score = scoreArtistNameMatch(mainArtist, queryTokens);
  return score >= artistMatchThreshold(queryTokens.length);
}

async function readCache(query: string, maxAgeMs: number): Promise<EjiSearchResult | null> {
  try {
    const file = cachePath(query);
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as EjiSearchResult;
    const age = Date.now() - Date.parse(parsed.fetchedAt);
    if (!Number.isFinite(age) || age > maxAgeMs) return null;
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

async function writeCache(result: EjiSearchResult): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePath(result.query), JSON.stringify(result, null, 2), "utf8");
  } catch {
    // cache is best-effort (read-only FS on serverless without /tmp)
  }
}

/**
 * EJI jogosultkutatás — előadónév alapján (hangfelvétel + előadóművész tab).
 * Prototípus: HTML scrape, nincs hivatalos API.
 */
export async function searchEjiByArtist(
  artistName: string,
  options?: { forceRefresh?: boolean; cacheTtlMs?: number },
): Promise<EjiSearchResult> {
  const query = artistName.trim();
  if (query.length < 2) {
    return {
      query,
      trackHits: [],
      artistHits: [],
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  }

  const ttl = options?.cacheTtlMs ?? 7 * 24 * 60 * 60 * 1000;
  if (!options?.forceRefresh) {
    const cached = await readCache(query, ttl);
    if (cached) return cached;
  }

  const [trackHtml, artistHtml] = await Promise.all([
    ejiFormPost(EJI_TRACK_SEARCH_URL, {
      "appbundle_recordSearch[mainArtist]": query,
      "appbundle_recordSearch[title]": "",
      "appbundle_recordSearch[publisher]": "",
      "appbundle_recordSearch[publicationYear]": "",
      "appbundle_recordSearch[or]": "1",
      "appbundle_recordSearch[all]": "",
    }),
    ejiFormPost(EJI_ARTIST_SEARCH_URL, {
      "appbundle_artistSearch[name]": query,
    }),
  ]);

  const trackHits = parseEjiTrackHits(trackHtml).filter((hit) =>
    ejiArtistMatchesQuery(hit.mainArtist, query),
  );
  const artistHits = parseEjiArtistHits(artistHtml).filter((hit) =>
    ejiArtistMatchesQuery(hit.name, query),
  );

  const result: EjiSearchResult = {
    query,
    trackHits,
    artistHits,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };

  await writeCache(result);
  return result;
}
