import { decodeHtmlEntities } from "@/lib/cmo-web/parse-html";

export interface SpedidamRecordingHit {
  title: string;
  performer: string;
  isrc: string;
  producer: string;
  id: string;
}

/** Parse ILAD AJAX HTML fragment (`sped-result-item` blocks). */
export function parseSpedidamRecordingResults(html: string): SpedidamRecordingHit[] {
  const hits: SpedidamRecordingHit[] = [];
  const itemRe = /<div class="sped-result-item">([\s\S]*?)<\/div>\s*(?=<div class="sped-result-item">|<\/div>\s*$|$)/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRe.exec(html)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const performer = extractTag(block, "performer");
    const isrc = extractParagraph(block, "ISRC");
    const producer = extractParagraph(block, "Producteur");
    const idMatch = block.match(/SignalerAyantsDroitNonIdentifies\/(\d+)/);
    if (!title && !performer) continue;
    hits.push({
      title: title || "(névtelen)",
      performer,
      isrc,
      producer,
      id: idMatch?.[1] ?? `${title}:${performer}`,
    });
  }

  return hits;
}

function extractTag(block: string, className: string): string {
  const re = new RegExp(`<p class="${className}">([^<]*)</p>`, "i");
  const m = block.match(re);
  return decodeHtmlEntities(m?.[1]?.trim() ?? "");
}

function extractParagraph(block: string, label: string): string {
  const re = new RegExp(`<p>${label}\\s*:\\s*([^<]*)</p>`, "i");
  const m = block.match(re);
  return decodeHtmlEntities(m?.[1]?.trim() ?? "");
}
