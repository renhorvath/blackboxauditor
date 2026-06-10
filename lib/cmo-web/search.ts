import { searchKoda } from "@/lib/cmo-web/adapters/koda";
import { searchPendingCmoWeb } from "@/lib/cmo-web/adapters/pending";
import { searchSacem } from "@/lib/cmo-web/adapters/sacem";
import { searchSami } from "@/lib/cmo-web/adapters/sami";
import { searchSpedidam } from "@/lib/cmo-web/adapters/spedidam";
import { searchZaiks } from "@/lib/cmo-web/adapters/zaiks";
import { readCmoWebCache, writeCmoWebCache } from "@/lib/cmo-web/cache";
import { enabledCmoWebSources } from "@/lib/cmo-web/config";
import type { CmoWebSearchResult, CmoWebSourceId } from "@/lib/cmo-web/web-types";

type SearchFn = (query: string) => Promise<CmoWebSearchResult>;

const SEARCHERS: Record<CmoWebSourceId, SearchFn> = {
  zaiks: searchZaiks,
  sacem: searchSacem,
  spedidam: searchSpedidam,
  sami: searchSami,
  koda: searchKoda,
  prs: (q) => searchPendingCmoWeb("prs", q),
  sgae: (q) => searchPendingCmoWeb("sgae", q),
  buma: (q) => searchPendingCmoWeb("buma", q),
};

async function searchOne(
  source: CmoWebSourceId,
  query: string,
  options?: { forceRefresh?: boolean; cacheTtlMs?: number },
): Promise<CmoWebSearchResult> {
  const q = query.trim();
  const ttl = options?.cacheTtlMs ?? 7 * 24 * 60 * 60 * 1000;

  if (!options?.forceRefresh) {
    const cached = await readCmoWebCache(source, q, ttl);
    if (cached) return cached;
  }

  const result = await SEARCHERS[source](q);
  if (!result.error && result.hits.length > 0) {
    await writeCmoWebCache(result);
  }
  return result;
}

/** Parallel CMO web lookups (phase 3 + optional phase 4 stubs). */
export async function searchCmoWebByArtist(
  artistName: string,
  options?: { forceRefresh?: boolean; cacheTtlMs?: number; sources?: CmoWebSourceId[] },
): Promise<CmoWebSearchResult[]> {
  const query = artistName.trim();
  if (query.length < 2) return [];

  const sources = options?.sources ?? enabledCmoWebSources();
  if (sources.length === 0) return [];

  return Promise.all(sources.map((source) => searchOne(source, query, options)));
}
