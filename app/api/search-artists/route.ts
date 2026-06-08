import { NextRequest, NextResponse } from "next/server";
import { searchSpotifyArtists } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Legalább 2 karakter szükséges a kereséshez.", artists: [] },
      { status: 400 },
    );
  }

  try {
    const artists = await searchSpotifyArtists(q, 10);
    return NextResponse.json({ artists });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Keresési hiba";
    const missingCreds =
      msg.includes("SPOTIFY_CLIENT_ID") || msg.includes("SPOTIFY_CLIENT_SECRET");
    return NextResponse.json(
      {
        error: missingCreds
          ? "Spotify API nincs konfigurálva. Állítsd be a SPOTIFY_CLIENT_ID és SPOTIFY_CLIENT_SECRET változókat a .env.local fájlban."
          : msg,
        artists: [],
      },
      { status: missingCreds ? 503 : 502 },
    );
  }
}
