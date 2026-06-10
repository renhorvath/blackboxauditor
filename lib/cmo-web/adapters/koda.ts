import { fetchText } from "@/lib/cmo-web/http";
import { extractTableRows } from "@/lib/cmo-web/parse-html";
import { ejiArtistMatchesQuery } from "@/lib/cmo-web/eji-search";
import type { CmoWebHit, CmoWebSearchResult } from "@/lib/cmo-web/web-types";

const PAGE_URL = "https://koda.dk/en/revenue-from-your-music/claim-unpaid-royalties";

export async function searchKoda(query: string): Promise<CmoWebSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { source: "koda", query: q, hits: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  try {
    const html = await fetchText(PAGE_URL);
    const rows = extractTableRows(html);
    const hits: CmoWebHit[] = [];

    for (const cells of rows.slice(1)) {
      const title = cells.find((c) => c.length > 2 && !/^\d/.test(c)) ?? cells[0] ?? "";
      const identification = cells.join(" · ");
      if (!title) continue;
      if (!ejiArtistMatchesQuery(identification, q)) continue;
      hits.push({
        source: "koda",
        id: `koda:${title}`.slice(0, 120),
        title,
        identification,
        claimUrl: PAGE_URL,
      });
      if (hits.length >= 80) break;
    }

    return {
      source: "koda",
      query: q,
      hits,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (err) {
    return {
      source: "koda",
      query: q,
      hits: [],
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
