"use client";

import type { ArtistAuditMeta } from "@/lib/types";
import {
  AUDIT_SOURCE_HELP,
  AUDIT_SOURCES_INTRO,
  buildAuditSourceChips,
} from "@/lib/audit-source-labels";
import { ArtistAuditSourceCoverage } from "@/components/ArtistAuditSourceCoverage";
import { isOpsModeClient } from "@/lib/ops-mode";

function StatCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "critical" | "muted";
}) {
  const valueClass =
    tone === "critical"
      ? "text-[var(--accent-critical)]"
      : tone === "muted"
        ? "text-[var(--text-muted)]"
        : "text-[var(--text-primary)]";

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

export function ArtistAuditSummaryHeader({
  artistName,
  meta,
  problemCount,
  totalCount,
  catalogGapLine,
  catalogEnrichLine,
  onClearArtist,
  compact = false,
}: {
  artistName: string;
  meta: ArtistAuditMeta;
  problemCount: number;
  totalCount: number;
  catalogGapLine?: string | null;
  catalogEnrichLine?: string | null;
  onClearArtist?: () => void;
  compact?: boolean;
}) {
  const opsMode = isOpsModeClient();
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
      ? "Nincs kifizetetlen listás találat"
      : `${problemCount} dal érintett`;

  const cmoTotal = Object.values(meta.cmoCounts ?? {}).reduce((a, b) => a + b, 0);

  return (
    <header className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight text-[var(--text-primary)] md:text-2xl">
            {artistName}
          </h2>
          <p
            className={`mt-1 text-sm font-medium ${
              problemCount > 0 ? "text-[var(--accent-critical)]" : "text-emerald-600"
            }`}
          >
            {verdict}
          </p>
          {!compact && catalogGapLine ? (
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{catalogGapLine}</p>
          ) : null}
          {!compact && catalogEnrichLine ? (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{catalogEnrichLine}</p>
          ) : null}
        </div>
        {onClearArtist ? (
          <button
            type="button"
            onClick={onClearArtist}
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            Másik előadó
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Érintett dal" value={problemCount} tone={problemCount > 0 ? "critical" : "muted"} />
        <StatCard label="Összes találat" value={totalCount} />
        <StatCard label="ARTISJUS" value={meta.artisjusCount ?? 0} tone={(meta.artisjusCount ?? 0) > 0 ? "critical" : "default"} />
        <StatCard
          label="MLC + EU"
          value={(meta.mlcUnmatchedCount ?? 0) + (meta.mlcUnclaimedCount ?? 0) + cmoTotal + (meta.ejiCount ?? 0)}
        />
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.id}
              className="rounded-md bg-[color-mix(in_srgb,var(--accent-critical)_8%,transparent)] px-2 py-1 text-[11px] font-semibold text-[var(--accent-critical)]"
            >
              {chip.count}× {chip.label}
            </span>
          ))}
        </div>
      ) : null}

      {!compact ? <ArtistAuditSourceCoverage meta={meta} /> : null}

      {opsMode && !compact ? (
        <p className="font-mono text-[11px] text-[var(--text-muted)]">
          ISRC: {meta.isrcCount} · black box: {problemCount}
          {meta.catalogGaps ? ` · ISWC gap: ${meta.catalogGaps.missingIswc}` : ""}
        </p>
      ) : null}

      {!compact ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            Honnan jönnek a számok?
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{AUDIT_SOURCES_INTRO}</p>
          <ul className="mt-2 space-y-1.5 border-t border-[var(--border)] pt-2">
            {AUDIT_SOURCE_HELP.map((item) => (
              <li key={item.label} className="text-xs">
                <span className="font-semibold text-[var(--text-secondary)]">{item.label}</span>
                <span className="text-[var(--text-muted)]"> — {item.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </header>
  );
}
