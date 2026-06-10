import { ejiArtistMatchesQuery } from "@/lib/cmo-web/eji-search";
import { fetchCmoWebHtml } from "@/lib/cmo-web/http";
import { fetchSacemUnidentifiedWorks } from "@/lib/cmo-web/sacem-api";
import type { CmoWebHit, CmoWebSearchResult } from "@/lib/cmo-web/web-types";

const SEARCH_URL = "https://repertoire.sacem.fr/en/unidentified-works/search";

export async function searchSacem(query: string): Promise<CmoWebSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { source: "sacem", query: q, hits: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  try {
    let rows: Awaited<ReturnType<typeof fetchSacemUnidentifiedWorks>> = [];
    try {
      rows = await fetchSacemUnidentifiedWorks(q);
    } catch {
      const html = await fetchCmoWebHtml(`${SEARCH_URL}?q=${encodeURIComponent(q)}`, { waitForMs: 8000 });
      if (/repertoire unavailable|currently unavailable|indisponible/i.test(html)) {
        return {
          source: "sacem",
          query: q,
          hits: [],
          fetchedAt: new Date().toISOString(),
          fromCache: false,
          error: "SACEM repertoire temporarily unavailable (maintenance)",
        };
      }
    }

    const hits: CmoWebHit[] = [];
    for (const row of rows) {
      const title = row.workTitle ?? row.title ?? "";
      const identification = row.parties ?? row.interestedParties ?? title;
      if (!title) continue;
      const blob = `${title} ${identification}`;
      if (!ejiArtistMatchesQuery(blob, q)) continue;
      hits.push({
        source: "sacem",
        id: `sacem:${row.workCode ?? title}`.slice(0, 120),
        title,
        identification,
        claimUrl: SEARCH_URL,
      });
      if (hits.length >= 80) break;
    }

    return {
      source: "sacem",
      query: q,
      hits,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (err) {
    return {
      source: "sacem",
      query: q,
      hits: [],
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
