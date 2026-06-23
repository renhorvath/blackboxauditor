import { NextRequest, NextResponse } from "next/server";
import type { ArtistContext } from "@/lib/audit-core/artist-context-types";
import { deriveIdentityProposals } from "@/lib/audit-core/derive-identity-proposals";
import { evaluateIdentityStatus } from "@/lib/audit-core/evaluate-identity-status";
import { supplementIdentityProposalsFromMlc } from "@/lib/mlc-identity-hints";
import {
  artistContextSlug,
  artistContextStorageAvailable,
  loadArtistContext,
  saveArtistContext,
} from "@/lib/artist-context-store";
import { isOpsApiAuthorized } from "@/lib/ops-api";
import type { AuditRow } from "@/lib/types";

export const maxDuration = 30;

type IdentityAction = "propose" | "save";

async function buildSnapshot(displayName: string, rows: AuditRow[] | null) {
  const slug = artistContextSlug(displayName);
  const context = await loadArtistContext(slug);
  let proposals = rows && rows.length > 0 ? deriveIdentityProposals(displayName, rows) : null;
  if (proposals) {
    proposals = await supplementIdentityProposalsFromMlc(proposals, {
      legalName: context?.legalName,
      ipi: context?.ipi,
    });
  }
  const status = proposals
    ? evaluateIdentityStatus(proposals, context)
    : context?.wizardCompletedAt
      ? "resolved"
      : "skipped";
  return { slug, context, proposals, status };
}

export async function GET(req: NextRequest) {
  if (!isOpsApiAuthorized(req)) {
    return NextResponse.json({ error: "Ops only." }, { status: 403 });
  }

  const artistName = req.nextUrl.searchParams.get("artistName")?.trim() ?? "";
  if (artistName.length < 2) {
    return NextResponse.json({ error: "Érvénytelen előadónév." }, { status: 400 });
  }

  const snapshot = await buildSnapshot(artistName, null);
  return NextResponse.json({
    ...snapshot,
    storageAvailable: artistContextStorageAvailable(),
  });
}

export async function POST(req: NextRequest) {
  if (!isOpsApiAuthorized(req)) {
    return NextResponse.json({ error: "Ops only." }, { status: 403 });
  }

  let body: {
    action?: IdentityAction;
    artistName?: string;
    spotifyId?: string | null;
    rows?: AuditRow[];
    excludeAliases?: string[];
    aliases?: string[];
    legalName?: string | null;
    ipi?: string | null;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const artistName = body.artistName?.trim() ?? "";
  if (artistName.length < 2) {
    return NextResponse.json({ error: "Érvénytelen előadónév." }, { status: 400 });
  }

  const action = body.action === "save" ? "save" : "propose";
  const slug = artistContextSlug(artistName);

  if (action === "propose") {
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const snapshot = await buildSnapshot(artistName, rows);
    return NextResponse.json({
      ...snapshot,
      storageAvailable: artistContextStorageAvailable(),
    });
  }

  if (!artistContextStorageAvailable()) {
    return NextResponse.json(
      { error: "Artist context mentés csak a helyi adatgépen érhető el." },
      { status: 503 },
    );
  }

  const existing = (await loadArtistContext(slug)) ?? {
    slug,
    displayName: artistName,
    spotifyId: body.spotifyId ?? null,
    aliases: [],
    excludeAliases: [],
    legalName: null,
    ipi: null,
    wizardCompletedAt: null,
    updatedAt: new Date().toISOString(),
  };

  const next: ArtistContext = {
    ...existing,
    displayName: artistName,
    spotifyId: body.spotifyId ?? existing.spotifyId ?? null,
    aliases: Array.isArray(body.aliases) ? body.aliases.map((v) => v.trim()).filter(Boolean) : existing.aliases,
    excludeAliases: Array.isArray(body.excludeAliases)
      ? body.excludeAliases.map((v) => v.trim()).filter(Boolean)
      : existing.excludeAliases,
    legalName: body.legalName?.trim() || existing.legalName,
    ipi: body.ipi?.trim() || existing.ipi,
    wizardCompletedAt: new Date().toISOString(),
  };

  const saved = await saveArtistContext(next);
  const proposals =
    Array.isArray(body.rows) && body.rows.length > 0
      ? deriveIdentityProposals(artistName, body.rows)
      : null;
  const status = proposals
    ? evaluateIdentityStatus(proposals, saved)
    : "resolved";

  return NextResponse.json({
    slug,
    context: saved,
    proposals,
    status,
    storageAvailable: true,
  });
}
