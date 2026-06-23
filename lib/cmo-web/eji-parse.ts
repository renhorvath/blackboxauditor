import type { EjiArtistHit, EjiTrackHit } from "@/lib/cmo-web/eji-types";

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function cleanEjiField(value: string): string {
  return decodeHtmlEntities(value)
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

/** Split top-level `{ ... }` blocks from a Kendo `dataSource: [ ... ]` array. */
function splitKendoObjectBlocks(inner: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        blocks.push(inner.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return blocks;
}

/** Read a double-quoted JS string value for `key:` in a Kendo object literal. */
function extractJsQuotedField(block: string, key: string): string {
  const marker = `${key}:`;
  const idx = block.indexOf(marker);
  if (idx < 0) return "";

  let i = idx + marker.length;
  while (i < block.length && /\s/.test(block[i]!)) i++;
  if (block[i] !== '"') return "";
  i++;

  let out = "";
  while (i < block.length) {
    const ch = block[i]!;
    if (ch === "\\") {
      const next = block[i + 1];
      if (next === '"') {
        out += '"';
        i += 2;
        continue;
      }
      if (next === "\\") {
        out += "\\";
        i += 2;
        continue;
      }
      out += ch;
      i++;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i++;
  }

  return cleanEjiField(out);
}

function kendoBlockToRecord(block: string): Record<string, string> {
  const keys = [
    "id",
    "tipus",
    "vezetoeloado",
    "felvetelcim",
    "kiado",
    "kiadaseve",
    "album",
    "performers_num",
    "main_artists_num",
    "refId",
    "nev",
    "felosztas_idoszak_nev",
  ];
  const row: Record<string, string> = {};
  for (const key of keys) {
    const value = extractJsQuotedField(block, key);
    if (value) row[key] = value;
  }
  return row;
}

export function extractKendoDataSource(html: string): Record<string, unknown>[] {
  const match = html.match(/dataSource:\s*\[([\s\S]*?)\]\s*,\s*schema/);
  if (!match) return [];
  const inner = match[1]?.trim();
  if (!inner) return [];

  return splitKendoObjectBlocks(inner).map((block) => kendoBlockToRecord(block));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function asInt(value: unknown): number {
  const n = Number.parseInt(asString(value), 10);
  return Number.isFinite(n) ? n : 0;
}

export function parseEjiTrackHits(html: string): EjiTrackHit[] {
  return extractKendoDataSource(html)
    .map((row) => ({
      kind: "track" as const,
      id: asString(row.id),
      tipus: asString(row.tipus),
      mainArtist: asString(row.vezetoeloado),
      title: asString(row.felvetelcim),
      publisher: asString(row.kiado),
      publicationYear: (() => {
        const year = asInt(row.kiadaseve);
        return year > 0 ? year : null;
      })(),
      album: asString(row.album),
      performersNum: asInt(row.performers_num),
      mainArtistsNum: asInt(row.main_artists_num),
    }))
    .filter((hit) => hit.id && hit.title);
}

export function parseEjiArtistHits(html: string): EjiArtistHit[] {
  return extractKendoDataSource(html)
    .map((row) => ({
      kind: "artist" as const,
      refId: asString(row.refId),
      name: asString(row.nev),
      distributionPeriod: asString(row.felosztas_idoszak_nev),
    }))
    .filter((hit) => hit.refId && hit.name);
}
