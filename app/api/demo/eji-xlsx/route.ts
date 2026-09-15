import { NextRequest, NextResponse } from "next/server";
import type { EjiAdatlapRow } from "@/lib/eji/adatlap-schema";
import { buildEjiAdatlapXlsx } from "@/lib/eji/export-xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      rows?: EjiAdatlapRow[];
      query?: string;
    };
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (!rows.length) {
      return NextResponse.json({ error: "Nincs exportálható sor." }, { status: 400 });
    }
    if (rows.length > 500) {
      return NextResponse.json(
        { error: "Max 500 sor / export (EJI sablon limit közeli)." },
        { status: 400 },
      );
    }

    const buf = await buildEjiAdatlapXlsx(rows, { query: body.query });
    const tag = (body.query || "adatlap").replace(/[^\w\-]+/g, "_").slice(0, 40);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="eji-adatlap-${tag}.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "xlsx hiba";
    console.error("[demo/eji-xlsx]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
