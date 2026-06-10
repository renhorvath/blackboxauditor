import { fetchText } from "@/lib/cmo-web/http";
import { extractTableRows } from "@/lib/cmo-web/parse-html";
import { ejiArtistMatchesQuery } from "@/lib/cmo-web/eji-search";
import type { CmoWebHit, CmoWebSearchResult } from "@/lib/cmo-web/web-types";

const SEARCH_URL = "https://www.spedidam.fr/ilad";

export async function searchSpedidam(query: string): Promise<CmoWebSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { source: "spedidam", query: q, hits: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  try {
    const url = `${SEARCH_URL}?q=${encodeURIComponent(q)}`;
    const html = await fetchText(url);
    const rows = extractTableRows(html);
    const hits: CmoWebHit[] = [];

    for (const cells of rows.slice(1)) {
      const title = cells[0] ?? "";
      const identification = cells[1] ?? cells.slice(1).join(" · ");
      if (!title && !identification) continue;
      const blob = `${title} ${identification}`;
      if (!ejiArtistMatchesQuery(blob, q)) continue;
      hits.push({
        source: "spedidam",
        id: `spedidam:${title}:${identification}`.slice(0, 120),
        title: title || "(névtelen)",
        identification,
        claimUrl: SEARCH_URL,
      });
      if (hits.length >= 80) break;
    }

    return {
      source: "spedidam",
      query: q,
      hits,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (err) {
    return {
      source: "spedidam",
      query: q,
      hits: [],
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
