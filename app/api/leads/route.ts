import { NextRequest, NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { insertLead } from "@/lib/leads-db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { email?: string; searchedName?: string; source?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Érvényes e-mail cím szükséges." }, { status: 400 });
  }

  const searchedName = body.searchedName?.trim().slice(0, 200) || null;
  const source = body.source?.trim().slice(0, 60) || "landing";

  // Without a DB the landing still works as a capture-less mock.
  if (!dbConfigured()) {
    return NextResponse.json({ ok: true, stored: false });
  }

  try {
    const lead = await insertLead({
      email,
      searchedName,
      source,
      meta: {
        userAgent: req.headers.get("user-agent") ?? undefined,
        referer: req.headers.get("referer") ?? undefined,
      },
    });
    return NextResponse.json({ ok: true, stored: true, id: lead.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Mentés sikertelen.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
