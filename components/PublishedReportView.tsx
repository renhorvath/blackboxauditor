"use client";

import type { PublishedReportPayload } from "@/lib/report-types";
import type { CaseFindingStatus } from "@/lib/report-types";
import { PublishedFindingCard } from "@/components/PublishedFindingCard";

export function PublishedReportView({
  report,
  publicCaseNotes,
}: {
  report: PublishedReportPayload;
  publicCaseNotes?: Array<{
    findingKey: string;
    playbookId: string;
    status: CaseFindingStatus;
    publicNote: string | null;
  }>;
}) {
  const caseByPlaybook = new Map<
    string,
    { status: CaseFindingStatus; publicNote: string | null }
  >();
  for (const c of publicCaseNotes ?? []) {
    caseByPlaybook.set(`${c.findingKey}:${c.playbookId}`, {
      status: c.status,
      publicNote: c.publicNote,
    });
  }

  const findings = report.snapshot.findings;
  const published = new Date(report.publishedAt).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <header className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
          Jogdíj-ellenőrzés
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[var(--text-primary)]">
          {report.artistDisplayName}
        </h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {published} · {findings.length} figyelendő találat
        </p>
        <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
          Ez egy pillanatkép az ellenőrzésről — nem minősül jogi tanácsnak, és nem garantál
          claimet vagy kifizetést. A recovery lépések tájékoztató jellegűek.
        </p>
      </header>

      {findings.length === 0 ? (
        <p className="text-center text-[var(--text-secondary)]">Nincs megjeleníthető találat.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
          {findings.map((f) => (
            <PublishedFindingCard
              key={f.findingKey}
              finding={f}
              caseByPlaybook={caseByPlaybook}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
