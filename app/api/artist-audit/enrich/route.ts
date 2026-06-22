import { NextRequest, NextResponse } from "next/server";
import { enrichArtistAuditRows } from "@/lib/artist-audit-enrich";
import type { AuditRow } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: { rows?: AuditRow[]; artistName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) {
    return NextResponse.json({ error: "Nincs enrich-elhető sor." }, { status: 400 });
  }

  const artistName = body.artistName?.trim() ?? "";

  try {
    const result = await enrichArtistAuditRows(rows, { artistName });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
