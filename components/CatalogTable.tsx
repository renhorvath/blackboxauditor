"use client";

import { auditRowKey } from "@/lib/artist-audit-filters";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import type { AuditRow } from "@/lib/types";
import { isArtisjusSyntheticIsrc, isSyntheticAuditIsrc } from "@/lib/types";

function formatIsrc(row: AuditRow): string {
  if (!row.isrc?.trim()) return "—";
  if (isArtisjusSyntheticIsrc(row.isrc)) return "— (ARTISJUS)";
  if (isSyntheticAuditIsrc(row.isrc)) return "— (lista)";
  return row.isrc;
}

export function CatalogTable({ rows }: { rows: AuditRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[var(--border)] px-6 py-8 text-center text-sm text-[var(--text-muted)]">
        Nincs katalógus sor a szűrők alapján.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-secondary)] text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <th className="px-3 py-2.5">Cím</th>
            <th className="px-3 py-2.5">Előadó</th>
            <th className="px-3 py-2.5">ISRC</th>
            <th className="px-3 py-2.5">ISWC</th>
            <th className="px-3 py-2.5">MLC</th>
            <th className="px-3 py-2.5">ARTISJUS</th>
            <th className="px-3 py-2.5">Listán</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((row) => (
            <tr key={auditRowKey(row)} className="hover:bg-[var(--bg-secondary)]/50">
              <td className="px-3 py-2 font-medium text-[var(--text-primary)]">
                {row.title ?? "—"}
              </td>
              <td className="px-3 py-2 text-[var(--text-secondary)]">{row.artist ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
                {formatIsrc(row)}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
                {row.iswc?.trim() || "—"}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--text-secondary)]">
                {row.mlcMatchStatus}
                {row.mlcUnclaimed ? " · unclaimed" : ""}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-[var(--text-muted)]">
                {row.artisjusMukod ?? "—"}
              </td>
              <td className="px-3 py-2 text-xs">
                {rowHasPayoutProblem(row) ? (
                  <span className="font-semibold text-[var(--accent-critical)]">igen</span>
                ) : (
                  <span className="text-[var(--text-muted)]">nem</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
