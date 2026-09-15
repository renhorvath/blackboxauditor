import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") ?? "xls";
  const root = path.join(process.cwd(), "data/eji/templates");

  if (kind === "classical") {
    const file = path.join(root, "hangfelveteli_adatlap_komolyzene.pdf");
    const buf = await readFile(file);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="hangfelveteli_adatlap_komolyzene.pdf"',
      },
    });
  }

  if (kind === "xlsx") {
    const file = path.join(root, "hangfelveteli_adatlap_excel_sablon.xlsx");
    const buf = await readFile(file);
    return new NextResponse(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="hangfelveteli_adatlap_excel_sablon.xlsx"',
      },
    });
  }

  // Official batch format is .xls
  const file = path.join(root, "hangfelveteli_adatlap_excel_sablon_official.xls");
  const buf = await readFile(file);
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.ms-excel",
      "Content-Disposition":
        'attachment; filename="hangfelveteli_adatlap_excel_sablon.xls"',
    },
  });
}
