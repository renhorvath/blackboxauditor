import { ejiArtistMatchesQuery } from "@/lib/cmo-web/eji-search";
import { fetchText } from "@/lib/cmo-web/http";
import { parseSpedidamRecordingResults } from "@/lib/cmo-web/parse-spedidam";
import type { CmoWebHit, CmoWebSearchResult } from "@/lib/cmo-web/web-types";

const SEARCH_URL = "https://ilad.spedidam.fr/RechercheV2/RechercherTitres?Length=9";
const CLAIM_BASE = "https://ilad.spedidam.fr/RechercheV2/AyantsDroitNonIdentifies";

export async function searchSpedidam(query: string): Promise<CmoWebSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { source: "spedidam", query: q, hits: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  try {
    const body = new URLSearchParams({
      titre: "",
      artisteOuGroupe: q,
      ISRC: "",
    });

    const html = await fetchText(SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: body.toString(),
    });

    const parsed = parseSpedidamRecordingResults(html);
    const hits: CmoWebHit[] = [];
    const seen = new Set<string>();

    for (const row of parsed) {
      const blob = `${row.title} ${row.performer} ${row.producer}`;
      if (!ejiArtistMatchesQuery(blob, q)) continue;
      const key = `${row.title}|${row.performer}|${row.isrc}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({
        source: "spedidam",
        id: `spedidam:${row.id}`,
        title: row.title,
        identification: [row.performer, row.isrc, row.producer].filter(Boolean).join(" · "),
        claimUrl: CLAIM_BASE,
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
