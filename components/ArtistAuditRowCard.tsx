"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronRight } from "lucide-react";
import { GapBadgeStrip } from "@/components/GapBadgeStrip";
import { RecoveryStepsPanel } from "@/components/RecoveryStepsPanel";
import { catalogMetaFactsForRow } from "@/lib/audit-core/catalog-meta-facts";
import { deriveGapBadges } from "@/lib/audit-core/derive-gap-badges";
import { getSourceDetailsForRow } from "@/lib/artist-audit-row-details";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { recoveryBundleForAuditRow } from "@/lib/recovery-for-row";
import { isOpsModeClient } from "@/lib/ops-mode";
import type { AuditRow } from "@/lib/types";
import { isArtisjusSyntheticIsrc, isSyntheticAuditIsrc } from "@/lib/types";

export function ArtistAuditRowCard({
  row,
  queryArtistName,
  showRecovery = true,
  includeInPublish = true,
  onTogglePublishInclude,
  showPublishToggle = false,
  asListItem = true,
}: {
  row: AuditRow;
  queryArtistName?: string;
  showRecovery?: boolean;
  includeInPublish?: boolean;
  onTogglePublishInclude?: (included: boolean) => void;
  showPublishToggle?: boolean;
  asListItem?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const opsMode = isOpsModeClient();
  const hasProblem = rowHasPayoutProblem(row);
  const title = row.title ?? "(névtelen dal)";
  const details = getSourceDetailsForRow(row);
  const gapBadges = useMemo(
    () => deriveGapBadges(row, queryArtistName),
    [row, queryArtistName],
  );
  const catalogFacts = useMemo(
    () => (opsMode ? catalogMetaFactsForRow(row, queryArtistName) : []),
    [opsMode, row, queryArtistName],
  );
  const recovery = useMemo(
    () => (showRecovery ? recoveryBundleForAuditRow(row, details) : { playbooks: [], fallbacks: [] }),
    [showRecovery, row, details],
  );

  const sourceLabels = details.map((d) => d.sourceLabel);
  const Tag = asListItem ? "li" : "div";

  return (
    <Tag
      className={`group border-b border-[var(--border)] last:border-b-0 ${
        showPublishToggle && !includeInPublish ? "bg-[var(--bg-secondary)]/40 opacity-70" : "bg-[var(--bg-primary)]"
      }`}
    >
      <div className="flex items-stretch gap-0">
        {showPublishToggle && onTogglePublishInclude ? (
          <label
            className="flex w-10 shrink-0 cursor-pointer items-center justify-center border-r border-[var(--border)]"
            title="Beleértve a jelentésbe"
          >
            <input
              type="checkbox"
              checked={includeInPublish}
              onChange={(e) => onTogglePublishInclude(e.target.checked)}
              className="size-4 accent-[var(--accent-primary)]"
            />
          </label>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5 text-left transition hover:bg-[var(--bg-secondary)]/50"
        >
          <span className="mt-1 shrink-0">
            {hasProblem ? (
              <AlertCircle className="size-4 text-[var(--accent-critical)]" aria-hidden />
            ) : (
              <CheckCircle2 className="size-4 text-[var(--text-muted)]" aria-hidden />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-semibold text-[var(--text-primary)]">{title}</span>
              {row.artist ? (
                <span className="text-xs text-[var(--text-muted)]">{row.artist}</span>
              ) : null}
            </span>

            {isSyntheticAuditIsrc(row.isrc) ? (
              <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                {isArtisjusSyntheticIsrc(row.isrc)
                  ? "ARTISJUS lista · nincs ISRC"
                  : "CMO lista · nincs ISRC"}
              </span>
            ) : row.isrc ? (
              <span className="mt-1 block font-mono text-[11px] text-[var(--text-muted)]">{row.isrc}</span>
            ) : null}

            {sourceLabels.length > 0 ? (
              <span className="mt-2 flex flex-wrap gap-1.5">
                {sourceLabels.map((label) => (
                  <span
                    key={label}
                    className="rounded-md bg-[color-mix(in_srgb,var(--accent-critical)_8%,transparent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-critical)]"
                  >
                    {label}
                  </span>
                ))}
              </span>
            ) : null}

            <GapBadgeStrip badges={gapBadges} showPriority={opsMode} />
          </span>

          <ChevronRight
            className={`mt-1 size-4 shrink-0 text-[var(--text-muted)] transition ${open ? "rotate-90" : ""}`}
            aria-hidden
          />
        </button>
      </div>

      {open ? (
        <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/30 px-4 py-4 pl-14">
          {details.length > 0 ? (
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
                  {details.map((block) => (
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
          ) : null}

          {opsMode && catalogFacts.length > 0 ? (
            <dl className="mt-4 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
              {catalogFacts.map((fact) => (
                <div key={fact.label} className="flex gap-2">
                  <dt className="shrink-0 text-[var(--text-muted)]">{fact.label}</dt>
                  <dd className="font-mono text-[11px] text-[var(--text-secondary)]">{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {showRecovery ? (
            <div className="mt-4">
              <RecoveryStepsPanel bundle={recovery} />
            </div>
          ) : null}
        </div>
      ) : null}
    </Tag>
  );
}
