import { NextRequest, NextResponse } from "next/server";
import { runLandingTeaser } from "@/lib/artist-audit";

/** EJI scrape (~40s) + CMO web run in parallel; MLC is skipped for the teaser. */
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: { artistName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const artistName = body.artistName?.trim() ?? "";
  if (artistName.length < 2) {
    return NextResponse.json({ error: "Érvénytelen előadónév." }, { status: 400 });
  }

  try {
    const result = await runLandingTeaser(artistName);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
