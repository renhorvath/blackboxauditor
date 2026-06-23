/** Optional per-artist catalog seed CSV — extra ISRC/title rows for enrich meta. */

import fs from "node:fs";

import { resolveArtistCatalogFiles } from "@/lib/artist-data-paths";
import type { SearchTrackHit } from "@/lib/types";

function normalizeIsrcKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "");
}

function parseCsvRows(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) {
      row[header[i]] = cols[i] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

/** Merge seed CSV ISRCs into Spotify meta map (does not overwrite existing). */
export function loadCatalogSeed(
  spotifyByIsrc: Map<string, SearchTrackHit>,
  options: { slug?: string | null; defaultArtist?: string | null },
): { added: number; path: string | null } {
  const slug = options.slug?.trim();
  if (!slug) return { added: 0, path: null };

  const seedPath = resolveArtistCatalogFiles(slug).catalogSeedCsv;
  if (!seedPath) return { added: 0, path: null };

  const fallbackArtist = options.defaultArtist?.trim() || "Unknown Artist";
  let added = 0;

  for (const row of parseCsvRows(seedPath)) {
    const isrc = normalizeIsrcKey(row.isrc ?? "");
    const title = row.title?.trim();
    if (!isrc || !title || spotifyByIsrc.has(isrc)) continue;

    const artists = (row.artists ?? row.artist ?? "")
      .split(/[,;|]/)
      .map((a) => a.trim())
      .filter(Boolean);

    spotifyByIsrc.set(isrc, {
      spotifyId: row.spotify_id?.trim() || `seed:${isrc}`,
      title,
      artists: artists.length > 0 ? artists : [fallbackArtist],
      album: row.release_name?.trim() || row.album?.trim() || null,
      isrc,
    });
    added += 1;
  }

  return { added, path: seedPath };
}
