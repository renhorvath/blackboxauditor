import { NextRequest, NextResponse } from "next/server";
import { searchSpotifyArtists, fetchSpotifyArtistById } from "@/lib/spotify";
import { parseSpotifyArtistRef } from "@/lib/spotify-resolve";

export const runtime = "nodejs";

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\w\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameRelevant(artistName: string, query: string): boolean {
  const nt = fold(artistName).split(/\s+/).filter(Boolean);
  const qt = fold(query).split(/\s+/).filter(Boolean);
  if (!qt.length) return false;
  if (fold(artistName) === fold(query)) return true;
  // Minden query token szerepel a névben — ne jöjjön related zaj
  if (qt.every((t) => nt.some((n) => n.includes(t) || t.includes(n)))) {
    return true;
  }
  // Egy tokenes query: a név tartalmazza
  if (qt.length === 1) {
    return fold(artistName).includes(qt[0]);
  }
  return false;
}

/** Typeahead: név vagy artist URL/ID → katalógus jelöltek. */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ artists: [] });
  }

  try {
    const asId = parseSpotifyArtistRef(q);
    if (asId) {
      const one = await fetchSpotifyArtistById(asId);
      return NextResponse.json({
        artists: one
          ? [
              {
                id: one.spotifyId,
                name: one.name,
                followers: one.followers,
                genres: one.genres,
                imageUrl: one.imageUrl,
                locked: true,
              },
            ]
          : [],
      });
    }

    const hits = await searchSpotifyArtists(q, 10);
    const filtered = hits.filter((a) => nameRelevant(a.name, q));
    const list = (filtered.length ? filtered : hits.slice(0, 3)).slice(0, 8);
    return NextResponse.json({
      artists: list.map((a) => ({
        id: a.spotifyId,
        name: a.name,
        followers: a.followers,
        genres: a.genres,
        imageUrl: a.imageUrl,
        locked: false,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Keresés hiba";
    return NextResponse.json(
      { error: msg.replace(/Spotify/gi, "Katalógus"), artists: [] },
      { status: 502 },
    );
  }
}
