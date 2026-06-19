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
}: {
  lens: AuditLensId;
  onLensChange: (lens: AuditLensId) => void;
  showCatalog: boolean;
  opsMode: boolean;
}) {
  const options = showCatalog
    ? LENS_OPTIONS
    : LENS_OPTIONS.filter((o) => o.id !== "catalog");

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-[var(--text-secondary)]">
        Nézet{opsMode ? " (ops)" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onLensChange(opt.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              lens === opt.id
                ? "bg-[var(--accent-primary)] text-white"
                : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {lens === "by_work" ? (
        <p className="text-[11px] text-[var(--text-muted)]">
          Ugyanazon műhöz tartozó felvételek egy csoportban (ISWC, műkód vagy cím alapján).
        </p>
      ) : null}
      {lens === "catalog" ? (
        <p className="text-[11px] text-[var(--text-muted)]">
          Metaadat táblázat — ISRC, ISWC, MLC és ARTISJUS azonosítók egy helyen.
        </p>
      ) : null}
    </div>
  );
}
