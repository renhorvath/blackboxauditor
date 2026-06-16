"use client";

import type { PlaybookSnapshot } from "@/lib/recovery-types";
import type { CaseFindingStatus } from "@/lib/report-types";

const STATUS_LABELS: Record<CaseFindingStatus, string> = {
  open: "Nyitott",
  in_progress: "Folyamatban",
  submitted: "Beküldve",
  resolved: "Megoldva",
  not_applicable: "Nem alkalmazható",
};

export function RecoveryPlaybookPanel({
  playbook,
  fallbackAction,
  caseStatus,
  publicNote,
}: {
  playbook: PlaybookSnapshot | null | undefined;
  fallbackAction?: string;
  caseStatus?: CaseFindingStatus | null;
  publicNote?: string | null;
}) {
  if (!playbook) {
    if (!fallbackAction) return null;
    return (
      <div className="mt-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-sm text-[var(--text-secondary)]">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Recovery (általános)
        </p>
        <p className="mt-1">{fallbackAction}</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Recovery · {playbook.organization}
        </p>
        {playbook.confidence === "draft" ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
            vázlat
          </span>
        ) : null}
        {caseStatus ? (
          <span className="rounded-full bg-[var(--bg-primary)] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-secondary)]">
            {STATUS_LABELS[caseStatus]}
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">{playbook.summary}</p>
      {publicNote ? (
        <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">{publicNote}</p>
      ) : null}
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-[var(--text-primary)]">
        {playbook.steps
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((step) => (
            <li key={step.id}>
              <span className="font-semibold">{step.title}</span>
              <span className="text-[var(--text-secondary)]"> — {step.description}</span>
            </li>
          ))}
      </ol>
      {playbook.requiredData.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Szükséges adatok</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-[var(--text-secondary)]">
            {playbook.requiredData.map((d) => (
              <li key={d.field}>
                {d.field}
                {d.required ? " *" : ""}
                {d.whereToGet ? ` (${d.whereToGet})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {playbook.requiredPermissions.length > 0 ? (
        <div className="mt-2">
          <p className="text-xs font-semibold text-[var(--text-muted)]">Jogosultság</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-[var(--text-secondary)]">
            {playbook.requiredPermissions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {playbook.channels.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {playbook.channels.map((ch) =>
            ch.url ? (
              <a
                key={ch.label}
                href={ch.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[var(--accent-primary)] underline-offset-2 hover:underline"
              >
                {ch.label}
              </a>
            ) : (
              <span key={ch.label} className="text-xs text-[var(--text-secondary)]">
                {ch.label}
                {ch.address ? `: ${ch.address}` : ""}
              </span>
            ),
          )}
        </div>
      ) : null}
      {playbook.pitfalls && playbook.pitfalls.length > 0 ? (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Figyelem: {playbook.pitfalls.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
