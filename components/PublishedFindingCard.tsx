"use client";

import { useState } from "react";
import { AlertCircle, ChevronDown } from "lucide-react";
import { GapBadgeStrip } from "@/components/GapBadgeStrip";
import { RecoveryPlaybookPanel } from "@/components/RecoveryPlaybookPanel";
import type { PublishedFinding, PublishedSourceBlock } from "@/lib/report-types";
import type { CaseFindingStatus } from "@/lib/report-types";
import { isArtisjusSyntheticIsrc, isSyntheticAuditIsrc } from "@/lib/types";

export function PublishedFindingCard({
  finding,
  caseByPlaybook,
}: {
  finding: PublishedFinding;
  caseByPlaybook?: Map<string, { status: CaseFindingStatus; publicNote: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const title = finding.title ?? "(névtelen dal)";

  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--accent-critical)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text-primary)]">{title}</p>
          {finding.artist ? (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{finding.artist}</p>
          ) : null}
          {isSyntheticAuditIsrc(finding.isrc) ? (
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">
              {isArtisjusSyntheticIsrc(finding.isrc)
                ? "Csak az ARTISJUS listán (nincs ISRC)"
                : "Csak külföldi CMO listán (nincs ISRC)"}
            </p>
          ) : finding.isrc ? (
            <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">{finding.isrc}</p>
          ) : null}
          <p className="mt-2 text-sm leading-snug text-[var(--text-secondary)]">
            {finding.laymanSummary}
          </p>
          {(finding.gapBadges ?? []).length > 0 ? (
            <GapBadgeStrip badges={finding.gapBadges ?? []} />
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-primary)]"
          >
            <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
            {open ? "Részletek elrejtése" : `Részletek (${finding.sourceBlocks.length})`}
          </button>
          {open ? (
            <div className="mt-3 space-y-3">
              {finding.sourceBlocks.map((block) => (
                <SourceBlockCard
                  key={block.id}
                  block={block}
                  caseStatus={
                    block.playbookId
                      ? caseByPlaybook?.get(`${finding.findingKey}:${block.playbookId}`)?.status
                      : undefined
                  }
                  publicNote={
                    block.playbookId
                      ? caseByPlaybook?.get(`${finding.findingKey}:${block.playbookId}`)?.publicNote
                      : undefined
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SourceBlockCard({
  block,
  caseStatus,
  publicNote,
}: {
  block: PublishedSourceBlock;
  caseStatus?: CaseFindingStatus;
  publicNote?: string | null;
}) {
  return (
    <article className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {block.region}
        </span>
        <span className="text-xs font-semibold text-[var(--text-primary)]">{block.sourceLabel}</span>
      </div>
      <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{block.headline}</p>
      {block.facts.length > 0 ? (
        <dl className="mt-2 space-y-1">
          {block.facts.map((fact) => (
            <div key={fact.label} className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-xs">
              <dt className="text-[var(--text-muted)]">{fact.label}</dt>
              <dd className="text-[var(--text-primary)]">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <RecoveryPlaybookPanel
        playbook={block.playbookSnapshot}
        fallbackAction={block.action}
        caseStatus={caseStatus}
        publicNote={publicNote}
      />
    </article>
  );
}
