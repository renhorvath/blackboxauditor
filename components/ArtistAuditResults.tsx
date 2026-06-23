"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import {
  formatCatalogGapSummary,
  summarizeCatalogGaps,
} from "@/lib/audit-core/derive-gap-badges";
import { rowHasPayoutProblem, sortArtistAuditRows } from "@/lib/artist-audit-display";
import {
  ALL_SOURCE_FILTER_IDS,
  auditRowKey,
  collectNameVariants,
  computeAuditCountsFromRows,
  defaultPublishVariantKeys,
  rowMatchesNameVariants,
  rowMatchesSourceFilters,
  type AuditSourceFilterId,
} from "@/lib/artist-audit-filters";
import {
  AUDIT_LOADING_MESSAGE,
} from "@/lib/audit-source-labels";
import { formatCatalogEnrichLine } from "@/lib/audit-core/catalog-enrich-label";
import { catalogLensAvailable } from "@/lib/audit-core/catalog-lens";
import { downloadActionableGapsCsv, rowIsPublishEligible } from "@/lib/audit-core/publish-gap";
import { groupRowsIntoWorkBuckets } from "@/lib/audit-core/group-work-buckets";
import type { AuditLensId } from "@/lib/audit-core/work-bucket-types";
import { AuditProgressStrip } from "@/components/AuditProgressStrip";
import { EnrichStatusPanel } from "@/components/EnrichStatusPanel";
import { AuditLensToggle } from "@/components/AuditLensToggle";
import { CatalogTable } from "@/components/CatalogTable";
import { WorkBucketCard } from "@/components/WorkBucketCard";
import { isOpsModeClient } from "@/lib/ops-mode";
import type { ArtistAuditMeta, AuditRow, AuditSummary } from "@/lib/types";
import { ArtistAuditFilters } from "@/components/ArtistAuditFilters";
import { ArtistAuditRowCard } from "@/components/ArtistAuditRowCard";
import { ArtistAuditSummaryHeader } from "@/components/ArtistAuditSummaryHeader";
import {
  IdentityStatusBanner,
  IdentityWizard,
  useArtistIdentity,
} from "@/components/IdentityWizard";

export function ArtistAuditResults({
  artistName,
  loading,
  rows,
  summary,
  meta,
  catalogBusy,
  mlcBusy = false,
  enrichBusy = false,
  onLoadFullCatalog,
  onOpenReport,
  onPublish,
  publishBusy,
  publishedUrl,
  readOnly = false,
  onClearArtist,
  spotifyId = null,
  onIdentitySaved,
}: {
  artistName: string;
  loading: boolean;
  rows: AuditRow[] | null;
  summary: AuditSummary | null;
  meta: ArtistAuditMeta | null;
  catalogBusy: boolean;
  mlcBusy?: boolean;
  enrichBusy?: boolean;
  onLoadFullCatalog: () => void;
  onOpenReport: () => void;
  onPublish?: (rows: AuditRow[]) => void;
  publishBusy?: boolean;
  publishedUrl?: string | null;
  readOnly?: boolean;
  onClearArtist: () => void;
  spotifyId?: string | null;
  onIdentitySaved?: (saved: { ipi: string | null; legalName: string | null }) => void;
}) {
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [identityWizardOpen, setIdentityWizardOpen] = useState(false);
  const [selectedVariantKeys, setSelectedVariantKeys] = useState<Set<string>>(() => new Set());
  const [publishExcludedKeys, setPublishExcludedKeys] = useState<Set<string>>(() => new Set());
  const [enabledSources, setEnabledSources] = useState<Set<AuditSourceFilterId>>(
    () => new Set(ALL_SOURCE_FILTER_IDS),
  );
  const [lens, setLens] = useState<AuditLensId>("findings");
  const opsMode = isOpsModeClient();

  const identity = useArtistIdentity({
    enabled: opsMode && !loading && Boolean(rows?.length),
    artistName,
    spotifyId,
    rows,
  });

  useEffect(() => {
    if (!rows) return;
    const variants = collectNameVariants(artistName, rows);
    setSelectedVariantKeys(defaultPublishVariantKeys(variants));
    setPublishExcludedKeys(new Set());
    setEnabledSources(new Set(ALL_SOURCE_FILTER_IDS));
    setLens("findings");
  }, [artistName, rows]);

  const sorted = useMemo(
    () => (rows ? sortArtistAuditRows(rows, artistName) : []),
    [rows, artistName],
  );

  const variantRows = useMemo(
    () => sorted.filter((row) => rowMatchesNameVariants(row, selectedVariantKeys)),
    [sorted, selectedVariantKeys],
  );

  const displayMeta = useMemo(() => {
    if (!meta) return null;
    return { ...meta, ...computeAuditCountsFromRows(variantRows) };
  }, [meta, variantRows]);

  const filtered = useMemo(
    () => variantRows.filter((row) => rowMatchesSourceFilters(row, enabledSources)),
    [variantRows, enabledSources],
  );

  const visible = useMemo(
    () => (onlyProblems ? filtered.filter(rowHasPayoutProblem) : filtered),
    [filtered, onlyProblems],
  );

  const problemCount = useMemo(() => filtered.filter(rowHasPayoutProblem).length, [filtered]);

  const catalogEnrichLine = useMemo(
    () => (meta ? formatCatalogEnrichLine(meta, enrichBusy) : null),
    [meta, enrichBusy],
  );

  const catalogGapLine = useMemo(() => {
    if (meta?.catalogGaps) return formatCatalogGapSummary(meta.catalogGaps);
    const problemRows = filtered.filter(rowHasPayoutProblem);
    return formatCatalogGapSummary(summarizeCatalogGaps(problemRows, artistName));
  }, [meta?.catalogGaps, filtered, artistName]);

  const publishRows = useMemo(
    () =>
      filtered.filter(
        (row) =>
          rowHasPayoutProblem(row) &&
          rowIsPublishEligible(row, artistName, { opsMode }) &&
          !publishExcludedKeys.has(auditRowKey(row)),
      ),
    [filtered, publishExcludedKeys, artistName, opsMode],
  );

  const publishExcludedVisible = useMemo(
    () =>
      filtered.filter(
        (row) => rowHasPayoutProblem(row) && publishExcludedKeys.has(auditRowKey(row)),
      ).length,
    [filtered, publishExcludedKeys],
  );

  const showCatalogLens = useMemo(
    () => catalogLensAvailable(opsMode, meta ?? {}, filtered.length),
    [opsMode, meta, filtered.length],
  );

  const workBuckets = useMemo(
    () => groupRowsIntoWorkBuckets(visible, artistName),
    [visible, artistName],
  );

  useEffect(() => {
    if (lens === "catalog" && !showCatalogLens) setLens("findings");
  }, [lens, showCatalogLens]);

  function togglePublishInclude(row: AuditRow, included: boolean) {
    const key = auditRowKey(row);
    setPublishExcludedKeys((prev) => {
      const next = new Set(prev);
      if (included) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function includeAllVisibleForPublish() {
    setPublishExcludedKeys((prev) => {
      const next = new Set(prev);
      for (const row of filtered) {
        if (rowHasPayoutProblem(row)) next.delete(auditRowKey(row));
      }
      return next;
    });
  }

  function excludeAllVisibleForPublish() {
    setPublishExcludedKeys((prev) => {
      const next = new Set(prev);
      for (const row of filtered) {
        if (rowHasPayoutProblem(row)) next.add(auditRowKey(row));
      }
      return next;
    });
  }

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

  if (loading) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-[var(--accent-primary)]" aria-hidden />
          <p className="text-lg font-semibold text-[var(--text-primary)]">{artistName}</p>
          <p className="max-w-md text-sm text-[var(--text-secondary)]">{AUDIT_LOADING_MESSAGE}</p>
        </div>
      </section>
    );
  }

  if (!rows || !summary || !meta) return null;

  return (
    <section className="space-y-5">
      <AuditProgressStrip mlcBusy={mlcBusy} enrichBusy={enrichBusy} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,300px)_1fr] xl:items-start">
        <aside className="space-y-4 xl:sticky xl:top-20">
          <ArtistAuditSummaryHeader
            artistName={artistName}
            meta={displayMeta ?? meta}
            problemCount={problemCount}
            totalCount={filtered.length}
            catalogGapLine={catalogGapLine}
            catalogEnrichLine={catalogEnrichLine}
            onClearArtist={readOnly ? undefined : onClearArtist}
            compact
          />

          <EnrichStatusPanel meta={meta} enrichBusy={enrichBusy} />

          {opsMode ? (
            <IdentityStatusBanner
              status={identity.status}
              storageAvailable={identity.storageAvailable}
              onOpenWizard={() => setIdentityWizardOpen(true)}
            />
          ) : null}

          <ArtistAuditFilters
            query={artistName}
            allRows={sorted}
            countRows={variantRows}
            selectedVariantKeys={selectedVariantKeys}
            onVariantKeysChange={setSelectedVariantKeys}
            enabledSources={enabledSources}
            onToggleSource={toggleSource}
            onSelectOnlySource={selectOnlySource}
            compact
          />

          {!readOnly && onPublish ? (
            <div className="hidden space-y-2 xl:block">
              <button
                type="button"
                onClick={() => onPublish(publishRows)}
                disabled={publishBusy || publishRows.length === 0}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-40"
              >
                {publishBusy ? "Közzététel…" : `Jelentés (${publishRows.length})`}
              </button>
              <button
                type="button"
                onClick={onOpenReport}
                disabled={filtered.length === 0}
                className="w-full rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                Részletes táblázat
              </button>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-4">
          {!readOnly && selectedVariantKeys.size === 0 ? (
            <p className="rounded-lg border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              Válassz legalább egy névváltozatot.
            </p>
          ) : null}

          {identity.error ? (
            <p className="text-xs text-[var(--text-muted)]">Identitás: {identity.error}</p>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setOnlyProblems(true)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  onlyProblems
                    ? "bg-[var(--accent-primary)] text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                }`}
              >
                Problémák ({problemCount})
              </button>
              <button
                type="button"
                onClick={() => setOnlyProblems(false)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                  !onlyProblems
                    ? "bg-[var(--accent-primary)] text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)]"
                }`}
              >
                Mind ({filtered.length})
              </button>
            </div>

            <AuditLensToggle
              lens={lens}
              onLensChange={setLens}
              showCatalog={showCatalogLens}
              opsMode={opsMode}
              inline
            />
          </div>

          {opsMode && rows?.length ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  downloadActionableGapsCsv(rows, artistName, { problemsOnly: onlyProblems, opsMode })
                }
                className="text-xs font-semibold text-[var(--accent-primary)] hover:underline"
              >
                Export CSV
              </button>
            </div>
          ) : null}

          {!readOnly && problemCount > 0 && lens === "findings" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
              <span>
                Jelentésbe: <strong className="text-[var(--text-primary)]">{publishRows.length}</strong>
                {publishExcludedVisible > 0 ? ` · ${publishExcludedVisible} kihagyva` : ""}
              </span>
              <span className="flex gap-2">
                <button type="button" onClick={includeAllVisibleForPublish} className="font-semibold text-[var(--accent-primary)]">
                  Mind be
                </button>
                <button type="button" onClick={excludeAllVisibleForPublish} className="font-semibold text-[var(--text-muted)]">
                  Mind ki
                </button>
              </span>
            </div>
          ) : null}

          {lens === "catalog" ? (
            <CatalogTable rows={filtered} />
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-12 text-center">
              <CheckCircle2 className="mx-auto size-8 text-[var(--text-muted)]" aria-hidden />
              <p className="mt-3 font-medium text-[var(--text-primary)]">
                {onlyProblems ? "Nincs kifizetetlen találat." : "Nincs megjeleníthető sor."}
              </p>
              {onlyProblems && filtered.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setOnlyProblems(false)}
                  className="mt-2 text-sm font-semibold text-[var(--accent-primary)]"
                >
                  Mind a {filtered.length} találat
                </button>
              ) : null}
            </div>
          ) : lens === "by_work" ? (
            <ul className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
              {workBuckets.map((bucket) => (
                <WorkBucketCard
                  key={bucket.workKey}
                  bucket={bucket}
                  queryArtistName={artistName}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          ) : (
            <ul className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
              {visible.map((row) => (
                <ArtistAuditRowCard
                  key={auditRowKey(row)}
                  row={row}
                  queryArtistName={artistName}
                  includeInPublish={
                    !rowHasPayoutProblem(row) || !publishExcludedKeys.has(auditRowKey(row))
                  }
                  onTogglePublishInclude={
                    rowHasPayoutProblem(row)
                      ? (included) => togglePublishInclude(row, included)
                      : undefined
                  }
                  showPublishToggle={!readOnly && rowHasPayoutProblem(row)}
                />
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4 sm:flex-row sm:items-center sm:justify-between xl:hidden">
            {!readOnly &&
            (meta.mlcScanSource === "cache" ||
              meta.mlcScanSource === "duckdb" ||
              meta.mlcUnclaimedScanSource === "duckdb") ? (
              <details className="text-sm">
                <summary className="cursor-pointer text-xs font-medium text-[var(--text-muted)]">
                  MLC frissítés
                </summary>
                <button
                  type="button"
                  disabled={catalogBusy}
                  onClick={onLoadFullCatalog}
                  className="mt-2 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-semibold disabled:opacity-45"
                >
                  {catalogBusy ? "Lekérdezés…" : "MLC újra"}
                </button>
              </details>
            ) : (
              <span />
            )}

            {!readOnly ? (
              <div className="flex flex-wrap gap-2">
                {onPublish ? (
                  <button
                    type="button"
                    onClick={() => onPublish(publishRows)}
                    disabled={publishBusy || publishRows.length === 0}
                    className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                  >
                    Jelentés ({publishRows.length})
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onOpenReport}
                  disabled={filtered.length === 0}
                  className="rounded-lg bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Táblázat ({filtered.length})
                </button>
              </div>
            ) : null}
          </div>

          {publishedUrl ? (
            <p className="text-xs text-[var(--text-secondary)]">
              Közzétéve:{" "}
              <a href={publishedUrl} className="font-semibold text-[var(--accent-primary)] underline">
                {publishedUrl}
              </a>
            </p>
          ) : null}
        </div>
      </div>

      {opsMode ? (
        <IdentityWizard
          open={identityWizardOpen}
          onClose={() => setIdentityWizardOpen(false)}
          artistName={artistName}
          proposals={identity.proposals}
          context={identity.context}
          storageAvailable={identity.storageAvailable}
          busy={identity.busy}
          error={identity.error}
          onSave={async (input) => {
            await identity.saveIdentity(input);
            onIdentitySaved?.(input);
          }}
          onRefresh={identity.refreshProposals}
        />
      ) : null}
    </section>
  );
}
