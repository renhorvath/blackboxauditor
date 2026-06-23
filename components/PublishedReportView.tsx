"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublishedReportPayload, CaseFindingStatus } from "@/lib/report-types";
import {
  ALL_SOURCE_FILTER_IDS,
  type AuditSourceFilterId,
} from "@/lib/artist-audit-filters";
import {
  collectNameVariantsFromFindings,
  computeCountsFromFindings,
  findingMatchesNameVariants,
  findingMatchesSourceFilters,
  findingSourceFilterCount,
} from "@/lib/published-finding-filters";
import { ArtistAuditFilters } from "@/components/ArtistAuditFilters";
import { ArtistAuditSummaryHeader } from "@/components/ArtistAuditSummaryHeader";
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
  const findings = report.snapshot.findings;
  const [selectedVariantKeys, setSelectedVariantKeys] = useState<Set<string>>(() => new Set());
  const [enabledSources, setEnabledSources] = useState<Set<AuditSourceFilterId>>(
    () => new Set(ALL_SOURCE_FILTER_IDS),
  );

  useEffect(() => {
    const variants = collectNameVariantsFromFindings(report.artistDisplayName, findings);
    setSelectedVariantKeys(new Set(variants.map((v) => v.key)));
    setEnabledSources(new Set(ALL_SOURCE_FILTER_IDS));
  }, [report.artistDisplayName, findings]);

  const caseByPlaybook = useMemo(() => {
    const map = new Map<string, { status: CaseFindingStatus; publicNote: string | null }>();
    for (const c of publicCaseNotes ?? []) {
      map.set(`${c.findingKey}:${c.playbookId}`, {
        status: c.status,
        publicNote: c.publicNote,
      });
    }
    return map;
  }, [publicCaseNotes]);

  const variantFindings = useMemo(
    () => findings.filter((f) => findingMatchesNameVariants(f, selectedVariantKeys)),
    [findings, selectedVariantKeys],
  );

  const filtered = useMemo(
    () => variantFindings.filter((f) => findingMatchesSourceFilters(f, enabledSources)),
    [variantFindings, enabledSources],
  );

  const displayMeta = useMemo(
    () => ({
      ...report.meta,
      ...computeCountsFromFindings(variantFindings),
    }),
    [report.meta, variantFindings],
  );

  const variantOptions = useMemo(
    () => collectNameVariantsFromFindings(report.artistDisplayName, findings),
    [report.artistDisplayName, findings],
  );

  const published = new Date(report.publishedAt).toLocaleDateString("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function toggleSource(id: AuditSourceFilterId) {
    setEnabledSources((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectOnlySource(id: AuditSourceFilterId) {
    setEnabledSources(new Set([id]));
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-[var(--text-muted)]">
        Pillanatkép · {published} · tájékoztató jellegű, nem minősül jogi tanácsnak.
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,300px)_1fr] xl:items-start">
        <aside className="space-y-4 xl:sticky xl:top-20">
          <ArtistAuditSummaryHeader
            artistName={report.artistDisplayName}
            meta={displayMeta}
            problemCount={filtered.length}
            totalCount={variantFindings.length}
            compact
          />
          <ArtistAuditFilters
            query={report.artistDisplayName}
            selectedVariantKeys={selectedVariantKeys}
            onVariantKeysChange={setSelectedVariantKeys}
            enabledSources={enabledSources}
            onToggleSource={toggleSource}
            onSelectOnlySource={selectOnlySource}
            variantOptions={variantOptions}
            sourceCount={(id) => findingSourceFilterCount(variantFindings, id)}
            publishedMode
            compact
          />
        </aside>

        <div className="min-w-0 space-y-4">
          {selectedVariantKeys.size === 0 ? (
            <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              Válassz legalább egy névváltozatot.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center text-[var(--text-secondary)]">
              Nincs találat a jelenlegi szűrőkkel.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
              {filtered.map((f) => (
                <PublishedFindingCard
                  key={f.findingKey}
                  finding={f}
                  caseByPlaybook={caseByPlaybook}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
