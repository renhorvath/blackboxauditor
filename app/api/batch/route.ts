import { NextRequest, NextResponse } from "next/server";
import { fetchBatchResults } from "@/lib/credits-fm";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { isrcs?: unknown };
    if (!Array.isArray(body.isrcs) || body.isrcs.length === 0) {
      return NextResponse.json({ error: "Adj meg legalább egy ISRC-t." }, { status: 400 });
    }
    const isrcs = body.isrcs.filter((x): x is string => typeof x === "string");
    if (isrcs.length !== body.isrcs.length) {
      return NextResponse.json({ error: "Érvénytelen ISRC lista." }, { status: 400 });
    }

    const results = await fetchBatchResults(isrcs);
    return NextResponse.json({ results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
