import { NextRequest, NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { insertLead } from "@/lib/leads-db";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: {
    email?: string;
    name?: string;
    searchedName?: string;
    phone?: string;
    occupation?: string;
    message?: string;
    source?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Érvényes e-mail cím szükséges." }, { status: 400 });
  }

  const source = body.source?.trim().slice(0, 60) || "landing";
  const name = body.name?.trim().slice(0, 200) || null;
  const searchedName = body.searchedName?.trim().slice(0, 200) || name;
  const phone = body.phone?.trim().slice(0, 60) || null;
  const occupation = body.occupation?.trim().slice(0, 80) || null;
  const message = body.message?.trim().slice(0, 4000) || null;

  if (source === "meder-contact") {
    if (!name || name.length < 2) {
      return NextResponse.json({ error: "Név megadása kötelező." }, { status: 400 });
    }
    if (!occupation) {
      return NextResponse.json({ error: "Válaszd ki, mivel foglalkozol." }, { status: 400 });
    }
  }

  if (!dbConfigured()) {
    return NextResponse.json({ ok: true, stored: false });
  }

  try {
    const lead = await insertLead({
      email,
      searchedName,
      source,
      meta: {
        name: name ?? undefined,
        phone: phone ?? undefined,
        occupation: occupation ?? undefined,
        message: message ?? undefined,
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
