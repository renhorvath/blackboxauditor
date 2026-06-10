import { scrapeViaFirecrawl } from "@/lib/cmo-web/firecrawl-scrape";

/** Optional Firecrawl scrape for JS-heavy CMO portals (set FIRECRAWL_API_KEY). */
export async function fetchHtmlViaFirecrawl(
  url: string,
  waitForMs = 5000,
): Promise<string> {
  const data = await scrapeViaFirecrawl(url, { waitForMs, formats: ["html"] });
  const html = data.html;
  if (!html?.trim()) {
    throw new Error("Firecrawl returned no HTML");
  }
  return html;
}
