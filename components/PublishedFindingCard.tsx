"use client";

import { useMemo, useState } from "react";
import { AlertCircle, ChevronRight } from "lucide-react";
import { GapBadgeStrip } from "@/components/GapBadgeStrip";
import { RecoveryStepsPanel } from "@/components/RecoveryStepsPanel";
import type { RowRecoveryBundle } from "@/lib/recovery-for-row";
import type { PublishedFinding, PublishedSourceBlock } from "@/lib/report-types";
import type { CaseFindingStatus } from "@/lib/report-types";
import { isArtisjusSyntheticIsrc, isSyntheticAuditIsrc } from "@/lib/types";

function bundleFromPublished(blocks: PublishedSourceBlock[]): RowRecoveryBundle {
  const byId = new Map<string, RowRecoveryBundle["playbooks"][0]>();
  const fallbacks: RowRecoveryBundle["fallbacks"] = [];

  for (const block of blocks) {
    if (block.playbookId && block.playbookSnapshot) {
      const existing = byId.get(block.playbookId);
      if (existing) {
        if (!existing.sources.includes(block.sourceLabel)) {
          existing.sources.push(block.sourceLabel);
        }
      } else {
        byId.set(block.playbookId, {
          playbookId: block.playbookId,
          snapshot: block.playbookSnapshot,
          sources: [block.sourceLabel],
        });
      }
    } else if (block.action) {
      fallbacks.push({
        source: block.sourceLabel,
        headline: block.headline,
        action: block.action,
      });
    }
  }

  return { playbooks: [...byId.values()], fallbacks };
}

export function PublishedFindingCard({
  finding,
  caseByPlaybook,
}: {
  finding: PublishedFinding;
  caseByPlaybook?: Map<string, { status: CaseFindingStatus; publicNote: string | null }>;
}) {
  const [open, setOpen] = useState(false);
  const title = finding.title ?? "(névtelen dal)";
  const recovery = useMemo(
    () => bundleFromPublished(finding.sourceBlocks),
    [finding.sourceBlocks],
  );
  const sourceLabels = finding.sourceBlocks.map((b) => b.sourceLabel);

  return (
    <li className="border-b border-[var(--border)] last:border-b-0 bg-[var(--bg-primary)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left hover:bg-[var(--bg-secondary)]/50"
      >
        <AlertCircle className="mt-1 size-4 shrink-0 text-[var(--accent-critical)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-[var(--text-primary)]">{title}</span>
          {finding.artist ? (
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{finding.artist}</span>
          ) : null}
          {isSyntheticAuditIsrc(finding.isrc) ? (
            <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
              {isArtisjusSyntheticIsrc(finding.isrc) ? "ARTISJUS · nincs ISRC" : "CMO · nincs ISRC"}
            </span>
          ) : finding.isrc ? (
            <span className="mt-1 block font-mono text-[11px] text-[var(--text-muted)]">{finding.isrc}</span>
          ) : null}
          {sourceLabels.length > 0 ? (
            <span className="mt-2 flex flex-wrap gap-1.5">
              {sourceLabels.map((label) => (
                <span
                  key={label}
                  className="rounded-md bg-[color-mix(in_srgb,var(--accent-critical)_8%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[var(--accent-critical)]"
                >
                  {label}
                </span>
              ))}
            </span>
          ) : null}
          {(finding.gapBadges ?? []).length > 0 ? (
            <GapBadgeStrip badges={finding.gapBadges ?? []} />
          ) : null}
        </span>
        <ChevronRight
          className={`mt-1 size-4 shrink-0 text-[var(--text-muted)] transition ${open ? "rotate-90" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 px-4 py-4 pl-11">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                  <th className="pb-2 pr-4 font-semibold">Forrás</th>
                  <th className="pb-2 pr-4 font-semibold">Mi történt</th>
                  <th className="pb-2 font-semibold">Részlet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {finding.sourceBlocks.map((block) => (
                  <tr key={block.id}>
                    <td className="py-2.5 pr-4 align-top">
                      <span className="font-semibold text-[var(--text-primary)]">{block.sourceLabel}</span>
                      <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">{block.region}</span>
                    </td>
                    <td className="py-2.5 pr-4 align-top text-[var(--text-secondary)]">{block.headline}</td>
                    <td className="py-2.5 align-top text-[var(--text-muted)]">
                      {block.facts.length > 0
                        ? block.facts.map((f) => `${f.label}: ${f.value}`).join(" · ")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <RecoveryStepsPanel
              bundle={recovery}
              caseByPlaybook={caseByPlaybook}
              findingKey={finding.findingKey}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}
