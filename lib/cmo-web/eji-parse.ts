import type { EjiArtistHit, EjiTrackHit } from "@/lib/cmo-web/eji-types";

/** Kendo grid embeds JS object literals in HTML — quote keys for JSON.parse. */
function jsObjectArrayToJsonObjects(raw: string): Record<string, unknown>[] {
  const trimmed = raw.replace(/,\s*$/, "");
  const jsonLike = trimmed
    .replace(/(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
    .replace(/,\s*}/g, "}");

  const parsed = JSON.parse(`[${jsonLike}]`) as Record<string, unknown>[];
  return Array.isArray(parsed) ? parsed : [];
}

export function extractKendoDataSource(html: string): Record<string, unknown>[] {
  const match = html.match(/dataSource:\s*\[([\s\S]*?)\]\s*,\s*schema/);
  if (!match) return [];
  const inner = match[1]?.trim();
  if (!inner) return [];
  try {
    return jsObjectArrayToJsonObjects(inner);
  } catch {
    return [];
  }
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
