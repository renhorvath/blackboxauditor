"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { rowHasPayoutProblem, sortArtistAuditRows } from "@/lib/artist-audit-display";
import {
  ALL_NAME_VARIANTS,
  ALL_SOURCE_FILTER_IDS,
  rowMatchesNameVariant,
  rowMatchesSourceFilters,
  type AuditSourceFilterId,
} from "@/lib/artist-audit-filters";
import {
  AUDIT_FILTER_ALL,
  AUDIT_FILTER_HINT,
  AUDIT_FILTER_PROBLEMS,
  AUDIT_LOADING_MESSAGE,
} from "@/lib/audit-source-labels";
import type { ArtistAuditMeta } from "@/lib/types";
import type { AuditRow, AuditSummary } from "@/lib/types";
import { ArtistAuditFilters } from "@/components/ArtistAuditFilters";
import { ArtistAuditRowCard } from "@/components/ArtistAuditRowCard";
import { ArtistAuditSummaryHeader } from "@/components/ArtistAuditSummaryHeader";

export function ArtistAuditResults({
  artistName,
  loading,
  rows,
  summary,
  meta,
  catalogBusy,
  onLoadFullCatalog,
  onOpenReport,
  onClearArtist,
}: {
  artistName: string;
  loading: boolean;
  rows: AuditRow[] | null;
  summary: AuditSummary | null;
  meta: ArtistAuditMeta | null;
  catalogBusy: boolean;
  onLoadFullCatalog: () => void;
  onOpenReport: () => void;
  onClearArtist: () => void;
}) {
  const [onlyProblems, setOnlyProblems] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(ALL_NAME_VARIANTS);
  const [enabledSources, setEnabledSources] = useState<Set<AuditSourceFilterId>>(
    () => new Set(ALL_SOURCE_FILTER_IDS),
  );

  useEffect(() => {
    setSelectedVariant(ALL_NAME_VARIANTS);
    setEnabledSources(new Set(ALL_SOURCE_FILTER_IDS));
  }, [artistName]);

  const sorted = useMemo(() => (rows ? sortArtistAuditRows(rows) : []), [rows]);

  const filtered = useMemo(
    () =>
      sorted.filter(
        (row) =>
          rowMatchesNameVariant(row, selectedVariant) &&
          rowMatchesSourceFilters(row, enabledSources),
      ),
    [sorted, selectedVariant, enabledSources],
  );

  const visible = useMemo(
    () => (onlyProblems ? filtered.filter(rowHasPayoutProblem) : filtered),
    [filtered, onlyProblems],
  );

  const problemCount = useMemo(() => filtered.filter(rowHasPayoutProblem).length, [filtered]);

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
      <ArtistAuditSummaryHeader
        artistName={artistName}
        meta={meta}
        problemCount={problemCount}
        totalCount={filtered.length}
        onClearArtist={onClearArtist}
      />

      <ArtistAuditFilters
        query={artistName}
        rows={sorted}
        selectedVariant={selectedVariant}
        onVariantChange={setSelectedVariant}
        enabledSources={enabledSources}
        onToggleSource={toggleSource}
        onSelectOnlySource={selectOnlySource}
      />

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

      {visible.length === 0 ? (
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
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
          {visible.map((row) => (
            <ArtistAuditRowCard key={row.isrc} row={row} />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {meta.mlcScanSource === "cache" ||
        meta.mlcScanSource === "duckdb" ||
        meta.mlcUnclaimedScanSource === "duckdb" ? (
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
    </section>
  );
}
