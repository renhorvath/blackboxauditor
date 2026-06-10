import { NextRequest, NextResponse } from "next/server";
import { runArtistAudit, type ArtistAuditPhase } from "@/lib/artist-audit";
import type { ArtistAuditScope } from "@/lib/types";

/** Vercel Hobby max; core + mlc phases each get their own 60s budget from the client. */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: {
    artistId?: string;
    artistName?: string;
    scope?: ArtistAuditScope;
    phase?: ArtistAuditPhase;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const artistName = body.artistName?.trim() ?? "";
  const scope: ArtistAuditScope = body.scope === "full" ? "full" : "top15";
  const phase: ArtistAuditPhase = body.phase ?? "full";

  if (artistName.length < 2) {
    return NextResponse.json({ error: "Érvénytelen előadónév." }, { status: 400 });
  }

  try {
    const result = await runArtistAudit({ artistName, scope, phase });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
