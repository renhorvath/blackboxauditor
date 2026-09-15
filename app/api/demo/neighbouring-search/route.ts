import { NextRequest, NextResponse } from "next/server";

import { buildNeighbouringActSearch } from "@/lib/demo/build-neighbouring-act";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json(
      { error: "Legalább 2 karakter kell." },
      { status: 400 },
    );
  }

  try {
    const act = await buildNeighbouringActSearch(q);
    return NextResponse.json({ act });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Keresési hiba";
    console.error("[demo/neighbouring-search]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
