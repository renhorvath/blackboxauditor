import { NextRequest, NextResponse } from "next/server";
import { buildPublishPayload } from "@/lib/report-snapshot";
import { publishReport, publishApiKeyValid } from "@/lib/reports-db";
import type { ArtistAuditMeta, AuditRow, AuditSummary, ArtistAuditScope } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!publishApiKeyValid(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    artistName?: string;
    scope?: ArtistAuditScope;
    rows?: AuditRow[];
    summary?: AuditSummary;
    meta?: ArtistAuditMeta;
    problemsOnly?: boolean;
    expiresAt?: string | null;
    supersedesReportId?: string | null;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const artistName = body.artistName?.trim() ?? "";
  if (artistName.length < 2 || !body.rows || !body.summary || !body.meta) {
    return NextResponse.json({ error: "artistName, rows, summary, meta required" }, { status: 400 });
  }

  try {
    const input = buildPublishPayload({
      artistName,
      scope: body.scope === "full" ? "full" : "top15",
      rows: body.rows,
      summary: body.summary,
      meta: body.meta,
      problemsOnly: body.problemsOnly ?? true,
      expiresAt: body.expiresAt,
      supersedesReportId: body.supersedesReportId,
    });
    const report = await publishReport(input);
    const base =
      process.env.REPORT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    const path = `/r/${report.token}`;
    return NextResponse.json({
      ...report,
      url: base ? `${base}${path}` : path,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
