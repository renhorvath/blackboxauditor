import { fetchText } from "@/lib/cmo-web/http";
import { extractTableRows } from "@/lib/cmo-web/parse-html";
import { ejiArtistMatchesQuery } from "@/lib/cmo-web/eji-search";
import type { CmoWebHit, CmoWebSearchResult } from "@/lib/cmo-web/web-types";

const SEARCH_URL = "https://online.zaiks.org.pl/lista-poszukiwanych";

export async function searchZaiks(query: string): Promise<CmoWebSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { source: "zaiks", query: q, hits: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  try {
    const url = `${SEARCH_URL}?search=${encodeURIComponent(q)}`;
    const html = await fetchText(url);
    const rows = extractTableRows(html);
    const hits: CmoWebHit[] = [];

    for (const cells of rows.slice(1)) {
      const title = cells[0] ?? cells[1] ?? "";
      const identification = cells[1] ?? cells[2] ?? cells[0] ?? "";
      if (!title && !identification) continue;
      if (!ejiArtistMatchesQuery(identification, q) && !ejiArtistMatchesQuery(title, q)) continue;
      hits.push({
        source: "zaiks",
        id: `zaiks:${title}:${identification}`.slice(0, 120),
        title: title || "(névtelen)",
        identification,
        claimUrl: "mailto:szukamy@zaiks.org.pl",
      });
      if (hits.length >= 80) break;
    }

    return {
      source: "zaiks",
      query: q,
      hits,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (err) {
    return {
      source: "zaiks",
      query: q,
      hits: [],
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
