import { NextRequest, NextResponse } from "next/server";
import {
  artisjusIndexAvailable,
  getArtisjusIndexLoadError,
  searchArtisjusByArtist,
} from "@/lib/artisjus-index";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get("artist")?.trim() ?? "";
  if (artist.length < 2) {
    return NextResponse.json(
      { error: "Legalább 2 karakter szükséges.", works: [] },
      { status: 400 },
    );
  }

  if (!artisjusIndexAvailable()) {
    return NextResponse.json(
      {
        error: getArtisjusIndexLoadError() ?? "ARTISJUS index not available",
        indexAvailable: false,
        works: [],
      },
      { status: 503 },
    );
  }

  const limit = Math.min(
    200,
    Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 150) || 150),
  );
  const matches = searchArtisjusByArtist(artist, limit);

  return NextResponse.json({
    indexAvailable: true,
    artist,
    count: matches.length,
    works: matches.map((m) => ({ ...m.work, score: m.score })),
  });
}
