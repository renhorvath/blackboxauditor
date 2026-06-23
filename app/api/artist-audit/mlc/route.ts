import { NextRequest, NextResponse } from "next/server";
import { runArtistAudit } from "@/lib/artist-audit";
import type { ArtistAuditScope } from "@/lib/types";

/** MLC DuckDB / TSV scan only — can take several minutes on first artist lookup. */
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  let body: { artistName?: string; scope?: ArtistAuditScope };
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
    const result = await runArtistAudit({ artistName, scope, mlc: "only" });
    return NextResponse.json({ ...result, meta: { ...result.meta, mlcPending: false } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
