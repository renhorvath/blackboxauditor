import { ejiArtistMatchesQuery } from "@/lib/cmo-web/eji-search";
import { fetchSamiIncompleteRecordings } from "@/lib/cmo-web/sami-api";
import type { CmoWebHit, CmoWebSearchResult } from "@/lib/cmo-web/web-types";

const CLAIM_URL = "https://minasidor.sami.se/incompleteRecordings";

export async function searchSami(query: string): Promise<CmoWebSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { source: "sami", query: q, hits: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  try {
    const rows = await fetchSamiIncompleteRecordings();
    const hits: CmoWebHit[] = [];

    for (const row of rows) {
      const blob = `${row.name} ${row.mainArtist} ${row.label}`;
      if (!ejiArtistMatchesQuery(blob, q)) continue;
      hits.push({
        source: "sami",
        id: `sami:${row.id}`,
        title: row.name || "(névtelen)",
        identification: [row.mainArtist, row.label, row.isrc, row.year > 0 ? String(row.year) : ""]
          .filter(Boolean)
          .join(" · "),
        claimUrl: CLAIM_URL,
      });
      if (hits.length >= 80) break;
    }

    return {
      source: "sami",
      query: q,
      hits,
      fetchedAt: new Date().toISOString(),
      fromCache: false,
    };
  } catch (err) {
    return {
      source: "sami",
      query: q,
      hits: [],
      fetchedAt: new Date().toISOString(),
      fromCache: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
