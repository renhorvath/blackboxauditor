"use client";

import Papa from "papaparse";
import { Download } from "lucide-react";
import type { AuditRow } from "@/lib/types";

function rowsToRecords(rows: AuditRow[]) {
  return rows.map((r) => ({
    ISRC: r.isrc,
    Cím: r.title ?? "",
    Előadó: r.artist ?? "",
    ISWC: r.iswc ?? "",
    "MLC státusz": r.mlcMatchStatus,
    "Share %": r.shareTotal ?? "",
    "Share státusz": r.shareStatus,
    Problémák: r.issues.map((i) => i.message).join(" | "),
    Javaslatok: r.issues.map((i) => i.action).join(" | "),
  }));
}

export function ExportButton({
  rows,
  disabled,
}: {
  rows: AuditRow[];
  disabled?: boolean;
}) {
  function handleClick() {
    const csv = Papa.unparse(rowsToRecords(rows));
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `music-metadata-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      disabled={disabled || rows.length === 0}
      onClick={handleClick}
      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-sm text-[var(--text-primary)] transition hover:border-[var(--border-active)] hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Download className="size-4" aria-hidden />
      CSV letöltés
    </button>
  );
}
