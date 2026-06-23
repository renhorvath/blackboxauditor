"use client";

import { Loader2 } from "lucide-react";

export function AuditProgressStrip({
  mlcBusy,
  enrichBusy,
}: {
  mlcBusy?: boolean;
  enrichBusy?: boolean;
}) {
  if (!mlcBusy && !enrichBusy) return null;

  const parts: string[] = [];
  if (mlcBusy) parts.push("MLC USA (háttérben — használhatod az oldalt)");
  if (enrichBusy) parts.push("Metaadat enrich");

  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm text-[var(--text-secondary)]"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="size-4 shrink-0 animate-spin text-[var(--accent-primary)]" aria-hidden />
      <span>{parts.join(" · ")}…</span>
    </div>
  );
}
