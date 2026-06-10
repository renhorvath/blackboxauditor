import { ejiArtistMatchesQuery } from "@/lib/cmo-web/eji-search";
import { scrapeViaFirecrawl } from "@/lib/cmo-web/firecrawl-scrape";
import { parseKodaUfmResults } from "@/lib/cmo-web/parse-koda";
import type { CmoWebHit, CmoWebSearchResult } from "@/lib/cmo-web/web-types";

const PAGE_URL =
  "https://old.koda.dk/medlem/selvbetjening/uidentificerede-vaerker-og-rettighedshavere/uidentificerede-vaerker-og-rettighedshavere?hideHeaderAndFooter=1";

export async function searchKoda(query: string): Promise<CmoWebSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { source: "koda", query: q, hits: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  try {
    const { html, markdown } = await scrapeViaFirecrawl(PAGE_URL, {
      waitForMs: 8000,
      formats: ["html", "markdown"],
      actions: [
        { type: "wait", milliseconds: 5000 },
        {
          type: "executeJavascript",
          script: `(() => {
            const category = document.querySelector('#Category');
            const input = document.querySelector('#LastName');
            const btn = document.querySelector('#ufm-search');
            if (!category || !input || !btn) return;
            for (const value of ['3', '4', '5', '2', '1', '6']) {
              category.value = value;
              category.dispatchEvent(new Event('change', { bubbles: true }));
            }
            category.value = '3';
            category.dispatchEvent(new Event('change', { bubbles: true }));
            input.value = ${JSON.stringify(q)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            btn.click();
          })()`,
        },
        { type: "wait", milliseconds: 8000 },
      ],
    });

    const fragment = html ?? markdown ?? "";
    const parsed = parseKodaUfmResults(fragment);
    const hits: CmoWebHit[] = [];

    for (const row of parsed) {
      if (!ejiArtistMatchesQuery(row.identification, q)) continue;
      hits.push({
        source: "koda",
        id: `koda:${row.title}`.slice(0, 120),
        title: row.title,
        identification: row.identification,
        claimUrl: "https://koda.dk/en/revenue-from-your-music/claim-unpaid-royalties",
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
