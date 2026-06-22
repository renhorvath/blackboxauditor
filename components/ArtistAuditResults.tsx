"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
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
  AUDIT_FILTER_ALL,
  AUDIT_FILTER_HINT,
  AUDIT_FILTER_PROBLEMS,
  AUDIT_LOADING_MESSAGE,
  AUDIT_MLC_LOADING_MESSAGE,
} from "@/lib/audit-source-labels";
import { catalogLensAvailable } from "@/lib/audit-core/catalog-lens";
import { downloadActionableGapsCsv, rowIsPublishEligible } from "@/lib/audit-core/publish-gap";
import { groupRowsIntoWorkBuckets } from "@/lib/audit-core/group-work-buckets";
import type { AuditLensId } from "@/lib/audit-core/work-bucket-types";
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
  onLoadFullCatalog,
  onOpenReport,
  onPublish,
  publishBusy,
  publishedUrl,
  readOnly = false,
  onClearArtist,
  spotifyId = null,
}: {
  artistName: string;
  loading: boolean;
  rows: AuditRow[] | null;
  summary: AuditSummary | null;
  meta: ArtistAuditMeta | null;
  catalogBusy: boolean;
  mlcBusy?: boolean;
  onLoadFullCatalog: () => void;
  onOpenReport: () => void;
  onPublish?: (rows: AuditRow[]) => void;
  publishBusy?: boolean;
  publishedUrl?: string | null;
  readOnly?: boolean;
  onClearArtist: () => void;
  spotifyId?: string | null;
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
    <section className="space-y-4">
      {mlcBusy ? (
        <div
          className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]"
          role="status"
        >
          <Loader2 className="size-4 shrink-0 animate-spin text-[var(--accent-primary)]" aria-hidden />
          <span>{AUDIT_MLC_LOADING_MESSAGE}</span>
        </div>
      ) : null}

      <ArtistAuditSummaryHeader
        artistName={artistName}
        meta={displayMeta ?? meta}
        problemCount={problemCount}
        totalCount={filtered.length}
        catalogGapLine={catalogGapLine}
        onClearArtist={readOnly ? undefined : onClearArtist}
      />

      {opsMode ? (
        <IdentityStatusBanner
          status={identity.status}
          storageAvailable={identity.storageAvailable}
          onOpenWizard={() => setIdentityWizardOpen(true)}
        />
      ) : null}

      {opsMode && rows?.length ? (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              downloadActionableGapsCsv(rows, artistName, { problemsOnly: onlyProblems, opsMode })
            }
            className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]"
          >
            Export actionable_gaps.csv
          </button>
        </div>
      ) : null}

      {identity.error ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs text-[var(--text-muted)]">
          Identitás: {identity.error}
        </p>
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
      />

      {!readOnly && selectedVariantKeys.size === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Válassz legalább egy névváltozatot a találatok megjelenítéséhez és a jelentéshez.
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOnlyProblems(true)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              onlyProblems
                ? "bg-[var(--accent-primary)] text-white"
                : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            {AUDIT_FILTER_PROBLEMS} ({problemCount})
          </button>
          <button
            type="button"
            onClick={() => setOnlyProblems(false)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              !onlyProblems
                ? "bg-[var(--accent-primary)] text-white"
                : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            {AUDIT_FILTER_ALL} ({filtered.length})
          </button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">{AUDIT_FILTER_HINT}</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
        <AuditLensToggle
          lens={lens}
          onLensChange={setLens}
          showCatalog={showCatalogLens}
          opsMode={opsMode}
        />
      </div>

      {lens === "catalog" ? (
        <CatalogTable rows={filtered} />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto size-8 text-[var(--text-muted)]" aria-hidden />
          <p className="mt-3 font-medium text-[var(--text-primary)]">
            {onlyProblems
              ? "Ezeken a dalokon nem találtunk kifizetetlen listás bejegyzést."
              : "Nincs megjeleníthető találat."}
          </p>
          {onlyProblems && filtered.length > 0 ? (
            <button
              type="button"
              onClick={() => setOnlyProblems(false)}
              className="mt-2 text-sm font-semibold text-[var(--accent-primary)] underline-offset-2 hover:underline"
            >
              Mind a {filtered.length} találat megtekintése
            </button>
          ) : null}
        </div>
      ) : lens === "by_work" ? (
        <>
          {!readOnly && problemCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
              <p className="text-xs text-[var(--text-secondary)]">
                {workBuckets.length} mű-csoport · {visible.length} felvétel
              </p>
            </div>
          ) : null}
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
            {workBuckets.map((bucket) => (
              <WorkBucketCard
                key={bucket.workKey}
                bucket={bucket}
                queryArtistName={artistName}
                readOnly={readOnly}
              />
            ))}
          </ul>
        </>
      ) : (
        <>
          {!readOnly && problemCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
              <p className="text-xs text-[var(--text-secondary)]">
                Jelentésbe: <span className="font-semibold text-[var(--text-primary)]">{publishRows.length}</span>
                {publishExcludedVisible > 0 ? (
                  <span className="text-[var(--text-muted)]"> · {publishExcludedVisible} kihagyva</span>
                ) : null}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={includeAllVisibleForPublish}
                  className="text-[11px] font-semibold text-[var(--accent-primary)]"
                >
                  Mind be
                </button>
                <button
                  type="button"
                  onClick={excludeAllVisibleForPublish}
                  className="text-[11px] font-semibold text-[var(--text-muted)]"
                >
                  Mind ki
                </button>
              </div>
            </div>
          ) : null}
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
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
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {!readOnly &&
        (meta.mlcScanSource === "cache" ||
        meta.mlcScanSource === "duckdb" ||
        meta.mlcUnclaimedScanSource === "duckdb") ? (
          <details className="group text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-[var(--text-secondary)] marker:content-none [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
              MLC adat frissítése
            </summary>
            <div className="mt-2 space-y-2 pl-5">
              <p className="text-xs text-[var(--text-muted)]">
                Újra lekérdezi az MLC adatbázist (DuckDB: másodpercek, TSV scan: percek).
              </p>
              <button
                type="button"
                disabled={catalogBusy}
                onClick={onLoadFullCatalog}
                className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-45"
              >
                {catalogBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    MLC lekérdezés…
                  </span>
                ) : (
                  "MLC újralekérdezése"
                )}
              </button>
            </div>
          </details>
        ) : meta.mlcScanSource === "live" || meta.mlcUnclaimedScanSource === "live" ? (
          <p className="text-xs text-[var(--text-muted)]">
            MLC: lassú TSV scan. Gyorsítás: npm run etl:parquet && npm run etl:catalog
          </p>
        ) : !readOnly ? (
          <span />
        ) : null}

        {!readOnly ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {onPublish ? (
              <button
                type="button"
                onClick={() => onPublish(publishRows)}
                disabled={publishBusy || publishRows.length === 0}
                className="shrink-0 rounded-[12px] border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] disabled:opacity-40"
              >
                {publishBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Közzététel…
                  </span>
                ) : (
                  `Jelentés közzététele (${publishRows.length})`
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onOpenReport}
              disabled={filtered.length === 0}
              className="shrink-0 rounded-[12px] bg-[var(--accent-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-40"
            >
              Részletes jelentés ({filtered.length})
            </button>
          </div>
        ) : null}
        {publishedUrl ? (
          <p className="text-xs text-[var(--text-secondary)]">
            Közzétéve:{" "}
            <a href={publishedUrl} className="font-semibold text-[var(--accent-primary)] underline">
              {publishedUrl}
            </a>
          </p>
        ) : null}
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
          onSave={identity.saveIdentity}
        />
      ) : null}
    </section>
  );
}
