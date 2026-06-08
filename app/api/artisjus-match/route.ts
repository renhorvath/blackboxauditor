import { NextRequest, NextResponse } from "next/server";
import {
  artisjusIndexAvailable,
  getArtisjusIndexLoadError,
  getArtisjusWorkCount,
  matchArtisjusTrack,
} from "@/lib/artisjus-index";
import { artisjusMatchFromResult } from "@/lib/artisjus-enrich";

export const runtime = "nodejs";

interface MatchRequestTrack {
  isrc: string;
  title?: string | null;
  artist?: string | null;
}

export async function POST(req: NextRequest) {
  let body: { tracks?: MatchRequestTrack[] };
  try {
    body = (await req.json()) as { tracks?: MatchRequestTrack[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tracks = body.tracks ?? [];
  if (tracks.length === 0) {
    return NextResponse.json({ matches: [], indexAvailable: artisjusIndexAvailable() });
  }
  if (tracks.length > 500) {
    return NextResponse.json(
      { error: "Maximum 500 tracks per ARTISJUS match request." },
      { status: 400 },
    );
  }

  if (!artisjusIndexAvailable()) {
    return NextResponse.json(
      {
        error: getArtisjusIndexLoadError() ?? "ARTISJUS index not available",
        indexAvailable: false,
        matches: tracks.map((t) => ({
          isrc: t.isrc,
          matched: false,
          score: 0,
        })),
      },
      { status: 503 },
    );
  }

  const matches = tracks.map((t) =>
    artisjusMatchFromResult(
      t.isrc,
      matchArtisjusTrack(t.title ?? null, t.artist ?? null),
    ),
  );

  return NextResponse.json({
    indexAvailable: true,
    workCount: getArtisjusWorkCount(),
    matches,
  });
}
