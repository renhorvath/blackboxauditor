import { ejiArtistMatchesQuery } from "@/lib/cmo-web/eji-search";
import { scrapeViaFirecrawl } from "@/lib/cmo-web/firecrawl-scrape";
import { parseZaiksMarkdownNames } from "@/lib/cmo-web/parse-zaiks";
import type { CmoWebHit, CmoWebSearchResult } from "@/lib/cmo-web/web-types";

const PAGE_URL = "https://online.zaiks.org.pl/lista-poszukiwanych";

export async function searchZaiks(query: string): Promise<CmoWebSearchResult> {
  const q = query.trim();
  if (q.length < 2) {
    return { source: "zaiks", query: q, hits: [], fetchedAt: new Date().toISOString(), fromCache: false };
  }

  try {
    const { markdown } = await scrapeViaFirecrawl(PAGE_URL, {
      waitForMs: 10000,
      formats: ["markdown"],
      actions: [
        { type: "wait", milliseconds: 5000 },
        {
          type: "executeJavascript",
          script: `(() => {
            const accept = Array.from(document.querySelectorAll('button')).find((b) => /akceptuj/i.test(b.textContent || ''));
            accept?.click();
            const input = document.querySelector('vaadin-text-field input, input[type="text"]');
            const search = Array.from(document.querySelectorAll('button')).find((b) => /szukaj/i.test(b.textContent || ''));
            if (!input || !search) return;
            input.focus();
            input.value = ${JSON.stringify(q)};
            input.dispatchEvent(new Event('input', { bubbles: true }));
            search.click();
          })()`,
        },
        { type: "wait", milliseconds: 10000 },
      ],
    });

    const names = parseZaiksMarkdownNames(markdown ?? "");
    const hits: CmoWebHit[] = [];

    for (const name of names) {
      if (!ejiArtistMatchesQuery(name, q)) continue;
      hits.push({
        source: "zaiks",
        id: `zaiks:${name}`.slice(0, 120),
        title: name,
        identification: name,
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
