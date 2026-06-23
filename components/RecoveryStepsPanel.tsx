"use client";

import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { RowRecoveryBundle } from "@/lib/recovery-for-row";
import type { CaseFindingStatus } from "@/lib/report-types";

const STATUS_LABELS: Record<CaseFindingStatus, string> = {
  open: "Nyitott",
  in_progress: "Folyamatban",
  submitted: "Beküldve",
  resolved: "Megoldva",
  not_applicable: "Nem alkalmazható",
};

export function RecoveryStepsPanel({
  bundle,
  caseByPlaybook,
  findingKey,
}: {
  bundle: RowRecoveryBundle;
  caseByPlaybook?: Map<string, { status: CaseFindingStatus; publicNote: string | null }>;
  findingKey?: string;
}) {
  const { playbooks: items, fallbacks } = bundle;
  const [openId, setOpenId] = useState<string | null>(items[0]?.playbookId ?? null);

  if (items.length === 0 && fallbacks.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Teendők{items.length > 0 ? ` (${items.length})` : ""}
      </p>
      {items.map((item) => {
        const open = openId === item.playbookId;
        const caseKey = findingKey ? `${findingKey}:${item.playbookId}` : item.playbookId;
        const caseInfo = caseByPlaybook?.get(caseKey);
        const steps = item.snapshot.steps.slice().sort((a, b) => a.order - b.order);

        return (
          <div
            key={item.playbookId}
            className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]"
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.playbookId)}
              className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-[var(--bg-secondary)]"
            >
              <ChevronDown
                className={`mt-0.5 size-4 shrink-0 text-[var(--text-muted)] transition ${open ? "rotate-180" : ""}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {item.snapshot.organization}
                  </span>
                  <span className="text-[11px] text-[var(--text-muted)]">
                    {item.sources.join(" · ")}
                  </span>
                  {item.snapshot.confidence === "draft" ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900">
                      vázlat
                    </span>
                  ) : null}
                  {caseInfo?.status ? (
                    <span className="rounded bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                      {STATUS_LABELS[caseInfo.status]}
                    </span>
                  ) : null}
                </div>
                {!open ? (
                  <p className="mt-0.5 line-clamp-1 text-xs text-[var(--text-muted)]">
                    {item.snapshot.summary}
                  </p>
                ) : null}
              </div>
            </button>
            {open ? (
              <div className="border-t border-[var(--border)] px-3 py-3">
                <p className="text-sm text-[var(--text-secondary)]">{item.snapshot.summary}</p>
                {caseInfo?.publicNote ? (
                  <p className="mt-2 text-sm font-medium text-[var(--text-primary)]">
                    {caseInfo.publicNote}
                  </p>
                ) : null}
                <ol className="mt-3 space-y-2">
                  {steps.map((step, idx) => (
                    <li key={step.id} className="flex gap-3 text-sm">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-xs font-semibold text-[var(--text-secondary)]">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-medium text-[var(--text-primary)]">{step.title}</p>
                        <p className="mt-0.5 text-[var(--text-secondary)]">{step.description}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                {item.snapshot.channels.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {item.snapshot.channels.map((ch) =>
                      ch.url ? (
                        <a
                          key={ch.label}
                          href={ch.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-primary)] hover:underline"
                        >
                          {ch.label}
                          <ExternalLink className="size-3" aria-hidden />
                        </a>
                      ) : (
                        <span key={ch.label} className="text-xs text-[var(--text-muted)]">
                          {ch.label}
                          {ch.address ? `: ${ch.address}` : ""}
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {fallbacks.map((fb) => (
        <div
          key={`${fb.source}-${fb.headline}`}
          className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm"
        >
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {fb.source}
            <span className="font-normal text-[var(--text-muted)]"> — {fb.headline}</span>
          </p>
          <p className="mt-1 text-[var(--text-secondary)]">{fb.action}</p>
        </div>
      ))}
    </div>
  );
}
