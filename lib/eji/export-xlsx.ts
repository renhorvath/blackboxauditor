import ExcelJS from "exceljs";
import {
  EJI_ADATLAP_COLUMNS,
  EJI_TEMPLATE_VERSION,
  type EjiAdatlapRow,
} from "@/lib/eji/adatlap-schema";

/** Hivatalos sablon oszlopaira írt .xlsx (Windows / EJI feltöltés). */
export async function buildEjiAdatlapXlsx(
  rows: EjiAdatlapRow[],
  opts?: { sheetName?: string; query?: string },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Eastaste EJI PoC";
  wb.created = new Date();
  const sheet = wb.addWorksheet(opts?.sheetName || "Hangfelvételi adatok");

  sheet.addRow(EJI_ADATLAP_COLUMNS.map((c) => c.header));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { wrapText: true, vertical: "middle" };

  for (const row of rows) {
    sheet.addRow(EJI_ADATLAP_COLUMNS.map((c) => row[c.key] ?? ""));
  }

  sheet.getColumn(1).width = 36;
  sheet.getColumn(2).width = 28;
  sheet.getColumn(3).width = 40;
  for (let i = 4; i <= EJI_ADATLAP_COLUMNS.length; i++) {
    sheet.getColumn(i).width = 16;
  }

  const meta = wb.addWorksheet("_poc_meta");
  meta.addRow(["sablon", EJI_TEMPLATE_VERSION]);
  meta.addRow(["query", opts?.query || ""]);
  meta.addRow(["rows", String(rows.length)]);
  meta.addRow(["generated", new Date().toISOString()]);
  meta.addRow([
    "note",
    "Emberi ellenőrzés után másold a Hangfelvételi adatok sort a hivatalos EJI .xls sablonba, ha a portál csak azt fogadja.",
  ]);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
