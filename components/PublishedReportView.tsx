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
    const active = ALL_SOURCE_FILTER_IDS.filter((id) => findingSourceFilterCount(findings, id) > 0);
    setEnabledSources(new Set(active.length > 0 ? active : ALL_SOURCE_FILTER_IDS));
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
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
          Jogdíj-ellenőrzés · pillanatkép
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{published}</p>
        <p className="mt-3 text-xs leading-relaxed text-[var(--text-muted)]">
          Ez egy pillanatkép az ellenőrzésről — nem minősül jogi tanácsnak, és nem garantál
          claimet vagy kifizetést. A recovery lépések tájékoztató jellegűek.
        </p>
      </div>

      <ArtistAuditSummaryHeader
        artistName={report.artistDisplayName}
        meta={displayMeta}
        problemCount={filtered.length}
        totalCount={variantFindings.length}
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
      />

      {selectedVariantKeys.size === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Válassz legalább egy névváltozatot a találatok megjelenítéséhez.
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center text-[var(--text-secondary)]">
          Nincs találat a jelenlegi szűrőkkel.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
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
  );
}
