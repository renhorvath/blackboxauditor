"use client";

import type { AuditLensId } from "@/lib/audit-core/work-bucket-types";

const LENS_OPTIONS: { id: AuditLensId; label: string }[] = [
  { id: "findings", label: "Találatok" },
  { id: "by_work", label: "Művek szerint" },
  { id: "catalog", label: "Katalógus" },
];

export function AuditLensToggle({
  lens,
  onLensChange,
  showCatalog,
  opsMode,
  inline = false,
}: {
  lens: AuditLensId;
  onLensChange: (lens: AuditLensId) => void;
  showCatalog: boolean;
  opsMode: boolean;
  inline?: boolean;
}) {
  const options = showCatalog
    ? LENS_OPTIONS
    : LENS_OPTIONS.filter((o) => o.id !== "catalog");

  return (
    <div className={inline ? "" : "space-y-1.5"}>
      {!inline ? (
        <p className="text-xs font-semibold text-[var(--text-secondary)]">
          Nézet{opsMode ? " (ops)" : ""}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onLensChange(opt.id)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition ${
              lens === opt.id
                ? "bg-[var(--bg-secondary)] text-[var(--text-primary)] ring-1 ring-[var(--border)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {!inline && lens === "by_work" ? (
        <p className="text-[11px] text-[var(--text-muted)]">
          Ugyanazon műhöz tartozó felvételek egy csoportban (ISWC, műkód vagy cím alapján).
        </p>
      ) : null}
      {!inline && lens === "catalog" ? (
        <p className="text-[11px] text-[var(--text-muted)]">
          Metaadat táblázat — ISRC, ISWC, MLC és ARTISJUS azonosítók egy helyen.
        </p>
      ) : null}
    </div>
  );
}
