import { normalizeArtisjusText } from "@/lib/artisjus-normalize";

function norm(value: string): string {
  return normalizeArtisjusText(value).replace(/\s+/g, " ").trim();
}

function wordTokens(value: string): string[] {
  return norm(value).split(" ").filter((t) => t.length >= 2);
}

function splitSegments(artist: string): string[] {
  return artist
    .split(/[,/&]| FEAT\.? | FEAT | VS\.? | X /i)
    .map((part) => norm(part))
    .filter(Boolean);
}

/** How closely the catalog artist field matches the user's search name. */
export type ArtistNameMatchStrength = "exact" | "word" | "substring" | "none";

export function artistNameMatchStrength(
  query: string,
  artist: string | null | undefined,
): ArtistNameMatchStrength {
  const q = norm(query);
  if (!q || !artist?.trim()) return "none";

  const full = norm(artist);
  const segments = splitSegments(artist);

  for (const seg of segments) {
    if (seg === q) return "exact";
    if (wordTokens(seg).includes(q)) return "word";
  }
  if (wordTokens(full).includes(q)) return "word";
  if (full.includes(q) || segments.some((seg) => seg.includes(q))) return "substring";
  return "none";
}

export function isUncertainNameMatch(
  query: string,
  artist: string | null | undefined,
): boolean {
  return artistNameMatchStrength(query, artist) === "substring";
}
