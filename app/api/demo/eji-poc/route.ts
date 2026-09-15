import { NextRequest, NextResponse } from "next/server";

import { buildEjiPocBundle } from "@/lib/eji/build-poc-bundle";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const submitter = req.nextUrl.searchParams.get("submitter")?.trim() ?? "";
  const spotifyArtistId =
    req.nextUrl.searchParams.get("spotifyArtistId")?.trim() ||
    req.nextUrl.searchParams.get("spotifyUrl")?.trim() ||
    "";
  const enrichDiscogs = req.nextUrl.searchParams.get("discogs") !== "0";
  // mb=0 → kényszerített kikapcsolás; egyébként a bundle dönt (hiányzó mező / classical)
  const enrichMb = req.nextUrl.searchParams.get("mb") !== "0";

  if (q.length < 2 && !spotifyArtistId) {
    return NextResponse.json(
      { error: "Legalább 2 karakter kell (q), vagy katalógus előadó link/ID." },
      { status: 400 },
    );
  }

  try {
    const bundle = await buildEjiPocBundle({
      query: q || spotifyArtistId,
      submitter: submitter || undefined,
      spotifyArtistId: spotifyArtistId || undefined,
      enrichMb,
      enrichDiscogs,
    });
    return NextResponse.json(bundle);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "PoC hiba";
    console.error("[demo/eji-poc]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
