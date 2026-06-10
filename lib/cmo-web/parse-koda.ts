import { decodeHtmlEntities } from "@/lib/cmo-web/parse-html";

export interface KodaUfmHit {
  title: string;
  identification: string;
}

/** Parse KODA UFM AJAX search result rows. */
export function parseKodaUfmResults(html: string): KodaUfmHit[] {
  const hits: KodaUfmHit[] = [];
  const rowRe = /<tr[^>]*class="[^"]*ufm-row[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
  let match: RegExpExecArray | null;

  while ((match = rowRe.exec(html)) !== null) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) =>
      decodeHtmlEntities(c[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()),
    );
    if (cells.length === 0) continue;
    const title = cells.find((c) => c.length > 1 && !/^\d+([.,]\d+)?\s*(DKK|kr)?$/i.test(c)) ?? cells[0] ?? "";
    const identification = cells.join(" · ");
    if (!title && !identification) continue;
    hits.push({ title: title || "(névtelen)", identification });
  }

  if (hits.length > 0) return hits;

  // Fallback: list items in markdown-like fragments
  const altRe = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  while ((match = altRe.exec(html)) !== null) {
    const text = decodeHtmlEntities(match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    if (text.length < 3) continue;
    hits.push({ title: text.slice(0, 120), identification: text });
  }

  return hits;
}
