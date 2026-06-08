import { NextRequest, NextResponse } from "next/server";
import {
  fetchSpotifyArtistById,
  fetchSpotifyArtistTopTracks,
  fetchSpotifyTrackById,
} from "@/lib/spotify";
import { parseSpotifyTrackOrArtist } from "@/lib/spotify-resolve";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url")?.trim() ?? "";
  const parsed = parseSpotifyTrackOrArtist(raw);
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Nem Spotify track vagy előadó URL (várt formátum: open.spotify.com/track/… vagy …/artist/…).",
        tracks: [] as unknown[],
        mode: null as string | null,
      },
      { status: 400 },
    );
  }

  try {
    if (parsed.kind === "track") {
      const t = await fetchSpotifyTrackById(parsed.id);
      if (!t) {
        return NextResponse.json(
          { error: "A felvétel nem található.", tracks: [], mode: "track" },
          { status: 404 },
        );
      }
      return NextResponse.json({ mode: "track", tracks: [t], error: null });
    }

    const tracks = await fetchSpotifyArtistTopTracks(parsed.id, 15);
    const artist = await fetchSpotifyArtistById(parsed.id);
    return NextResponse.json({
      mode: "artist",
      tracks,
      artistId: parsed.id,
      artistName: artist?.name ?? null,
      error: null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Spotify feloldási hiba";
    const missingCreds =
      msg.includes("SPOTIFY_CLIENT_ID") || msg.includes("SPOTIFY_CLIENT_SECRET");
    return NextResponse.json(
      {
        error: missingCreds ? "A Spotify API nincs konfigurálva a szerveren." : msg,
        tracks: [],
        mode: null as string | null,
      },
      { status: missingCreds ? 503 : 502 },
    );
  }
}
