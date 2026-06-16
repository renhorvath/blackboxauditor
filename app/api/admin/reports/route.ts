import { NextRequest, NextResponse } from "next/server";
import { listReports, operatorAuthValid, revokeReport } from "@/lib/reports-db";

export async function GET(req: NextRequest) {
  if (!operatorAuthValid(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const reports = await listReports();
    return NextResponse.json({ reports });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!operatorAuthValid(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  try {
    const ok = await revokeReport(id);
    return NextResponse.json({ revoked: ok });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
