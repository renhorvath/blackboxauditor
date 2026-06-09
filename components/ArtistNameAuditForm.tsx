"use client";

import { Search } from "lucide-react";
import { AUDIT_FORM_HINT, AUDIT_FORM_PLACEHOLDER } from "@/lib/audit-source-labels";

export function ArtistNameAuditForm({
  disabled,
  busy,
  onAudit,
}: {
  disabled?: boolean;
  busy?: boolean;
  onAudit: (artistName: string) => void;
}) {
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const name = String(fd.get("artistName") ?? "").trim();
        if (name.length >= 2) onAudit(name);
      }}
    >
      <div>
        <label htmlFor="artist-name-audit" className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
          Előadó neve
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            id="artist-name-audit"
            name="artistName"
            type="search"
            minLength={2}
            required
            disabled={disabled || busy}
            placeholder={AUDIT_FORM_PLACEHOLDER}
            className="input-bbox w-full py-2.5 pl-10 pr-4"
          />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{AUDIT_FORM_HINT}</p>
      </div>
      <button
        type="submit"
        disabled={disabled || busy}
        className="w-full rounded-[10px] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-45"
      >
        {busy ? "Ellenőrzés…" : "Jogdíj-ellenőrzés indítása"}
      </button>
    </form>
  );
}
