import { NextRequest, NextResponse } from "next/server";
import { fetchSpotifyArtistTopTracks } from "@/lib/spotify";

function isLikelyArtistId(id: string): boolean {
  return /^[a-zA-Z0-9]{16,32}$/.test(id.trim());
}

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get("artistId")?.trim() ?? "";
  if (!isLikelyArtistId(artistId)) {
    return NextResponse.json(
      { error: "Érvénytelen előadó-azonosító (artistId).", tracks: [] },
      { status: 400 },
    );
  }

  try {
    const tracks = await fetchSpotifyArtistTopTracks(artistId, 15);
    return NextResponse.json({ artistId, tracks, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Spotify hiba";
    const missingCreds =
      msg.includes("SPOTIFY_CLIENT_ID") || msg.includes("SPOTIFY_CLIENT_SECRET");
    return NextResponse.json(
      {
        error: missingCreds ? "A Spotify API nincs konfigurálva a szerveren." : msg,
        tracks: [],
      },
      { status: missingCreds ? 503 : 502 },
    );
  }
}
