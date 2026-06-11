"use client";

import {
  ALL_NAME_VARIANTS,
  ALL_SOURCE_FILTER_IDS,
  collectNameVariants,
  nameVariantLabel,
  SOURCE_FILTER_LABELS,
  sourceFilterCount,
  type AuditSourceFilterId,
  type NameVariantOption,
} from "@/lib/artist-audit-filters";
import type { AuditRow } from "@/lib/types";

export function ArtistAuditFilters({
  query,
  allRows,
  countRows,
  selectedVariant,
  onVariantChange,
  enabledSources,
  onToggleSource,
  onSelectOnlySource,
}: {
  query: string;
  /** All rows — used to list name variants. */
  allRows: AuditRow[];
  /** Rows after name-variant filter — used for per-source counts. */
  countRows: AuditRow[];
  selectedVariant: string;
  onVariantChange: (key: string) => void;
  enabledSources: ReadonlySet<AuditSourceFilterId>;
  onToggleSource: (id: AuditSourceFilterId) => void;
  onSelectOnlySource: (id: AuditSourceFilterId) => void;
}) {
  const variants = collectNameVariants(query, allRows);
  const activeSources = ALL_SOURCE_FILTER_IDS.filter((id) => sourceFilterCount(countRows, id) > 0);

  if (variants.length === 0 && activeSources.length === 0) return null;

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
      {variants.length > 0 ? (
        <div>
          <label
            htmlFor="artist-name-variant"
            className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]"
          >
            Névváltozat a találatokban
          </label>
          <select
            id="artist-name-variant"
            value={selectedVariant}
            onChange={(e) => onVariantChange(e.target.value)}
            className="input-bbox w-full px-3.5 py-2 text-sm"
          >
            <option value={ALL_NAME_VARIANTS}>
              Összes névváltozat ({allRows.length} sor)
            </option>
            {variants.map((v: NameVariantOption) => (
              <option key={v.key} value={v.key}>
                {nameVariantLabel(v)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
            A „hasonló név” találatok gyengébb egyezésűek — válassz pontosabb változatot, ha félrevezető
            eredményeket látsz.
          </p>
        </div>
      ) : null}

      {activeSources.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold text-[var(--text-secondary)]">
            Forrás szerinti szűrés
          </p>
          <div className="flex flex-wrap gap-2">
            {activeSources.map((id) => {
              const on = enabledSources.has(id);
              const count = sourceFilterCount(countRows, id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggleSource(id)}
                  onDoubleClick={() => onSelectOnlySource(id)}
                  title="Dupla kattintás: csak ez a forrás"
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    on
                      ? "bg-[var(--accent-primary)] text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-muted)] line-through opacity-60"
                  }`}
                >
                  {SOURCE_FILTER_LABELS[id]} ({count})
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
            Csak a bejelölt forrásokból származó találatok jelennek meg. Dupla kattintás egy forrásra:
            csak az.
          </p>
        </div>
      ) : null}
    </div>
  );
}
