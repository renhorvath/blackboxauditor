import { NextRequest, NextResponse } from "next/server";
import {
  getCaseFindingsByToken,
  getReportByToken,
  operatorAuthValid,
  upsertCaseFinding,
} from "@/lib/reports-db";
import type { CaseFindingStatus } from "@/lib/report-types";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const manage = req.nextUrl.searchParams.get("manage") === "1";
  if (manage && !operatorAuthValid(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const report = await getReportByToken(token);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const findings = await getCaseFindingsByToken(token);
    const payload = { findings };
    if (manage) {
      return NextResponse.json({ ...payload, reportId: report.reportId });
    }
    return NextResponse.json({
      findings: findings.map((f) => ({
        findingKey: f.findingKey,
        playbookId: f.playbookId,
        status: f.status,
        publicNote: f.publicNote,
        updatedAt: f.updatedAt,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  if (!operatorAuthValid(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { token } = await ctx.params;
  const report = await getReportByToken(token);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: {
    findingKey?: string;
    playbookId?: string;
    status?: CaseFindingStatus;
    stepProgress?: Record<string, "done" | "pending">;
    operatorNotes?: string | null;
    publicNote?: string | null;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.findingKey || !body.playbookId || !body.status) {
    return NextResponse.json({ error: "findingKey, playbookId, status required" }, { status: 400 });
  }

  try {
    const row = await upsertCaseFinding({
      reportId: report.reportId,
      findingKey: body.findingKey,
      playbookId: body.playbookId,
      status: body.status,
      stepProgress: body.stepProgress ?? {},
      operatorNotes: body.operatorNotes ?? null,
      publicNote: body.publicNote ?? null,
    });
    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
