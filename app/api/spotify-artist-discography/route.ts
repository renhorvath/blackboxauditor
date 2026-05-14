import { NextRequest, NextResponse } from "next/server";
import { fetchArtistDiscographyHits } from "@/lib/spotify";

/** Spotify artist id — alfanumerikus, nem üres */
function isLikelyArtistId(id: string): boolean {
  return /^[a-zA-Z0-9]{16,32}$/.test(id.trim());
}

export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get("artistId")?.trim() ?? "";
  if (!isLikelyArtistId(artistId)) {
    return NextResponse.json(
      { error: "Érvénytelen előadó-azonosító (artistId)." },
      { status: 400 },
    );
  }

  try {
    const result = await fetchArtistDiscographyHits(artistId);
    return NextResponse.json({
      error: null,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    const missingCreds =
      msg.includes("SPOTIFY_CLIENT_ID") || msg.includes("SPOTIFY_CLIENT_SECRET");
    return NextResponse.json(
      {
        error: missingCreds ? "A Spotify API nincs konfigurálva a szerveren." : msg,
        tracks: [],
        albumsScanned: 0,
        distinctTrackIds: 0,
        cappedByAlbums: false,
        cappedByTracks: false,
      },
      { status: missingCreds ? 503 : 502 },
    );
  }
}
