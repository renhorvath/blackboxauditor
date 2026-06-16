"use client";

import type { ArtistAuditMeta } from "@/lib/types";
import {
  AUDIT_SOURCE_HELP,
  AUDIT_SOURCES_INTRO,
  buildAuditSourceChips,
} from "@/lib/audit-source-labels";
import { ArtistAuditSourceCoverage } from "@/components/ArtistAuditSourceCoverage";

function SourceCountChip({ label, count }: { label: string; count: number }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[color-mix(in_srgb,var(--accent-critical)_10%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--accent-critical)]">
      {count}× {label}
    </span>
  );
}

export function ArtistAuditSummaryHeader({
  artistName,
  meta,
  problemCount,
  totalCount,
  onClearArtist,
}: {
  artistName: string;
  meta: ArtistAuditMeta;
  problemCount: number;
  totalCount: number;
  onClearArtist?: () => void;
}) {
  const chips = buildAuditSourceChips({
    artisjusCount: meta.artisjusCount,
    mlcUnmatchedCount: meta.mlcUnmatchedCount,
    mlcUnclaimedCount: meta.mlcUnclaimedCount,
    cmoCounts: meta.cmoCounts,
    cmoWebCounts: meta.cmoWebCounts,
    ejiCount: meta.ejiCount,
  });

  const verdict =
    problemCount === 0
      ? "A vizsgált listákon nem találtunk kifizetetlen bejegyzést ehhez a névhez."
      : `${problemCount} dal szerepel legalább egy kifizetetlen vagy azonosítatlan listán.`;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5 space-y-4">
      <ArtistAuditSourceCoverage meta={meta} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Eredmény
          </p>
          <h2 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{artistName}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{verdict}</p>
        </div>
        {onClearArtist ? (
          <button
            type="button"
            onClick={onClearArtist}
            className="shrink-0 text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
          >
            Másik előadó
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <SourceCountChip key={chip.id} label={chip.label} count={chip.count} />
        ))}
        {totalCount > 0 && problemCount === 0 && chips.length === 0 ? (
          <span className="text-xs text-[var(--text-muted)]">{totalCount} találat vizsgálva</span>
        ) : null}
      </div>

      <details className="group mt-4 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-[var(--text-muted)] marker:content-none">
          Honnan jönnek ezek a számok?
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{AUDIT_SOURCES_INTRO}</p>
        <ul className="mt-2 space-y-2 border-t border-[var(--border)] pt-3">
          {AUDIT_SOURCE_HELP.map((item) => (
            <li key={item.label}>
              <span className="font-semibold text-[var(--text-secondary)]">{item.label}</span>
              <span className="text-[var(--text-muted)]"> — {item.text}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
