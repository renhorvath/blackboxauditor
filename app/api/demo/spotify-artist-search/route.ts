import { NextRequest, NextResponse } from "next/server";
import { searchSpotifyArtists } from "@/lib/spotify";
import { parseSpotifyArtistRef } from "@/lib/spotify-resolve";
import { fetchSpotifyArtistById } from "@/lib/spotify";

export const runtime = "nodejs";

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

    const hits = await searchSpotifyArtists(q, 8);
    return NextResponse.json({
      artists: hits.map((a) => ({
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
