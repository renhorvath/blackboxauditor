import { NextRequest, NextResponse } from "next/server";
import { getReportByToken } from "@/lib/reports-db";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  try {
    const report = await getReportByToken(token);
    if (!report) {
      return NextResponse.json({ error: "Report not found or expired" }, { status: 404 });
    }
    return NextResponse.json(report);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
