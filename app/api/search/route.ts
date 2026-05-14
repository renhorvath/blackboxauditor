import { NextRequest, NextResponse } from "next/server";
import { searchSpotifyTracks } from "@/lib/spotify";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Legalább 2 karakter szükséges a kereséshez.", tracks: [] },
      { status: 400 },
    );
  }

  try {
    const tracks = await searchSpotifyTracks(q, 15);
    return NextResponse.json({ tracks });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Keresési hiba";
    const missingCreds =
      msg.includes("SPOTIFY_CLIENT_ID") || msg.includes("SPOTIFY_CLIENT_SECRET");
    return NextResponse.json(
      {
        error: missingCreds
          ? "Spotify API nincs konfigurálva. Állítsd be a SPOTIFY_CLIENT_ID és SPOTIFY_CLIENT_SECRET változókat a .env.local fájlban."
          : msg,
        tracks: [],
      },
      { status: missingCreds ? 503 : 502 },
    );
  }
}
