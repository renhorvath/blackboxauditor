import { NextRequest, NextResponse } from "next/server";
import { buildPublishPayload } from "@/lib/report-snapshot";
import { publishReport, publishApiKeyValid } from "@/lib/reports-db";
import type { ArtistAuditMeta, AuditRow, AuditSummary, ArtistAuditScope } from "@/lib/types";

/** Browser-safe publish: uses server env (DATABASE_URL) or forwards with PUBLISH_API_KEY. */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const insecure =
    process.env.ENABLE_INSECURE_PUBLISH?.trim().toLowerCase() === "true" &&
    process.env.NODE_ENV !== "production";
  const remoteUrl = process.env.REPORT_PUBLISH_URL?.trim();
  const remoteKey = process.env.PUBLISH_API_KEY?.trim();
  const canProxyFromLocalDev =
    process.env.NODE_ENV !== "production" && Boolean(remoteUrl && remoteKey);

  if (!insecure && !canProxyFromLocalDev && !publishApiKeyValid(auth)) {
    const secret = process.env.OPERATOR_SECRET?.trim();
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: {
    artistName?: string;
    scope?: ArtistAuditScope;
    rows?: AuditRow[];
    summary?: AuditSummary;
    meta?: ArtistAuditMeta;
    problemsOnly?: boolean;
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

  const payload = buildPublishPayload({
    artistName,
    scope: body.scope === "full" ? "full" : "top15",
    rows: body.rows,
    summary: body.summary,
    meta: body.meta,
    problemsOnly: body.problemsOnly ?? true,
    supersedesReportId: body.supersedesReportId,
  });

  if (remoteUrl && !process.env.DATABASE_URL?.trim()) {
    const key = remoteKey;
    const res = await fetch(remoteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        artistName,
        scope: payload.auditScope,
        rows: body.rows,
        summary: body.summary,
        meta: body.meta,
        problemsOnly: body.problemsOnly ?? true,
        supersedesReportId: body.supersedesReportId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  }

  try {
    const report = await publishReport(payload);
    const base =
      process.env.REPORT_PUBLIC_BASE_URL?.replace(/\/$/, "") ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3002");
    return NextResponse.json({
      ...report,
      url: `${base}/r/${report.token}`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Publish failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
