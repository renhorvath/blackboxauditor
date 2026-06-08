import type { AuditSummary } from "@/lib/types";

export function AuditSummaryCards({ summary }: { summary: AuditSummary }) {
  const missingShares = summary.withMissingShares ?? 0;
  const missingIpi = summary.withMissingIpiMlc ?? 0;

  const cards = [
    { label: "Összes felvétel", value: summary.total },
    { label: "Kritikus problémák", value: summary.withCriticalIssues },
    { label: "Hiányzó ISWC", value: summary.withIswcMissing },
    { label: "MLC unmatched", value: summary.withMlcUnmatched },
    { label: "Hiányos share", value: summary.withIncompleteShares },
    { label: "Nincs share", value: missingShares },
    { label: "Hiányzó IPI (MLC)", value: missingIpi },
    { label: "Nincs szerző adat", value: summary.withNoSongwriter },
    { label: "ARTISJUS listán", value: summary.withArtisjusUnmatched ?? 0 },
    { label: "Nem található", value: summary.notFound },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3"
        >
          <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            {c.label}
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
            {c.value}
          </p>
        </div>
      ))}
    </div>
  );
}
