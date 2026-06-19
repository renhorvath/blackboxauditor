import { NextRequest, NextResponse } from "next/server";
import { runArtistAudit, type ArtistAuditMlcMode } from "@/lib/artist-audit";
import type { ArtistAuditScope } from "@/lib/types";

/** EJI web scrape can take 30–40s on cold cache. */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: {
    artistId?: string;
    artistName?: string;
    scope?: ArtistAuditScope;
    mlc?: ArtistAuditMlcMode;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const artistName = body.artistName?.trim() ?? "";
  const scope: ArtistAuditScope = body.scope === "full" ? "full" : "top15";

  if (artistName.length < 2) {
    return NextResponse.json({ error: "Érvénytelen előadónév." }, { status: 400 });
  }

  try {
    const mlc = body.mlc === "skip" || body.mlc === "only" ? body.mlc : "wait";
    const result = await runArtistAudit({ artistName, scope, mlc });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
