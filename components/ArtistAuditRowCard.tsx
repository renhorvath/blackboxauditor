"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";
import { getSourceDetailsForRow, laymanSummaryForRow } from "@/lib/artist-audit-row-details";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import type { AuditRow } from "@/lib/types";
import { isArtisjusSyntheticIsrc, isSyntheticAuditIsrc } from "@/lib/types";

export function ArtistAuditRowCard({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false);
  const hasProblem = rowHasPayoutProblem(row);
  const title = row.title ?? "(névtelen dal)";
  const details = getSourceDetailsForRow(row);

  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        {hasProblem ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--accent-critical)]" aria-hidden />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text-primary)]">{title}</p>
          {row.artist ? (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{row.artist}</p>
          ) : null}
          {isSyntheticAuditIsrc(row.isrc) ? (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {isArtisjusSyntheticIsrc(row.isrc)
                ? "Csak az ARTISJUS azonosítatlan listán szerepel (nincs ISRC)"
                : "Csak egy külföldi szervezet listáján szerepel (nincs ISRC)"}
            </p>
          ) : row.isrc ? (
            <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">{row.isrc}</p>
          ) : null}

          <p
            className={`mt-2 text-sm leading-snug ${
              hasProblem ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
            }`}
          >
            {laymanSummaryForRow(row)}
          </p>

          {details.length > 0 ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-primary)]"
              >
                <ChevronDown
                  className={`size-3.5 transition ${open ? "rotate-180" : ""}`}
                  aria-hidden
                />
                {open ? "Részletek elrejtése" : `Részletek (${details.length} forrás)`}
              </button>
              {open ? (
                <div className="mt-3 space-y-2">
                  {details.map((block) => (
                    <article
                      key={block.id}
                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3"
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                          {block.region}
                        </span>
                        <span className="text-xs font-semibold text-[var(--text-primary)]">
                          {block.sourceLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                        {block.headline}
                      </p>
                      {block.facts.length > 0 ? (
                        <dl className="mt-2 space-y-1">
                          {block.facts.map((fact) => (
                            <div key={`${block.id}-${fact.label}`} className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
                              <dt className="text-[var(--text-muted)]">{fact.label}</dt>
                              <dd className="text-[var(--text-secondary)]">{fact.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {block.action ? (
                        <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                          <span className="font-semibold text-[var(--text-secondary)]">Teendő:</span>{" "}
                          {block.action}
                        </p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
