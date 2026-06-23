import { NextRequest, NextResponse } from "next/server";
import { enrichArtistAuditRows } from "@/lib/artist-audit-enrich";
import { enrichAuditLeg } from "@/lib/artist-audit-enrich-staged";
import {
  enrichLegMaxDurationSec,
  type EnrichLegId,
} from "@/lib/audit-core/enrich-plan";
import { loadArtistContext } from "@/lib/artist-context-store";
import { artistSlug } from "@/lib/recovery-case/artist-slug";
import type { AuditRow } from "@/lib/types";

export const maxDuration = 300;

const LEG_IDS: EnrichLegId[] = ["local", "spotify", "isrc", "cisac"];

export async function POST(req: NextRequest) {
  let body: {
    rows?: AuditRow[];
    artistName?: string;
    spotifyArtistId?: string;
    leg?: EnrichLegId;
  };
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
  const spotifyArtistId = body.spotifyArtistId?.trim();
  const context = artistName ? await loadArtistContext(artistSlug(artistName)) : null;
  const slug = context?.slug ?? (artistName ? artistSlug(artistName) : null);
  const enrichOpts = {
    artistName,
    artistSlug: slug,
    spotifyArtistId,
    legalName: context?.legalName,
    writerIpi: context?.ipi,
  };

  const leg = body.leg;
  if (leg && !LEG_IDS.includes(leg)) {
    return NextResponse.json({ error: `Ismeretlen enrich leg: ${leg}` }, { status: 400 });
  }

  try {
    if (leg) {
      void enrichLegMaxDurationSec(leg);
      const result = await enrichAuditLeg(leg, rows, enrichOpts);
      return NextResponse.json(result);
    }
    const result = await enrichArtistAuditRows(rows, enrichOpts);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
