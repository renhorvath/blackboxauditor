import Papa from "papaparse";

export function parseCsvForIsrcs(csvText: string): string[] {
  const parsed = Papa.parse<Record<string, string> | string[]>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.meta.fields && parsed.meta.fields.length > 0) {
    const isrcField = parsed.meta.fields.find((f) => f.toLowerCase().includes("isrc"));
    if (isrcField) {
      return (parsed.data as Record<string, string>[])
        .map((row) => row[isrcField])
        .filter(Boolean);
    }
  }

  return (parsed.data as string[][]).map((row) => row[0]).filter(Boolean);
}
