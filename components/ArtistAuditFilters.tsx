"use client";

import {
  ALL_SOURCE_FILTER_IDS,
  collectNameVariants,
  defaultPublishVariantKeys,
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
  selectedVariantKeys,
  onVariantKeysChange,
  enabledSources,
  onToggleSource,
  onSelectOnlySource,
}: {
  query: string;
  /** All rows — used to list name variants. */
  allRows: AuditRow[];
  /** Rows after name-variant filter — used for per-source counts. */
  countRows: AuditRow[];
  selectedVariantKeys: ReadonlySet<string>;
  onVariantKeysChange: (keys: Set<string>) => void;
  enabledSources: ReadonlySet<AuditSourceFilterId>;
  onToggleSource: (id: AuditSourceFilterId) => void;
  onSelectOnlySource: (id: AuditSourceFilterId) => void;
}) {
  const variants = collectNameVariants(query, allRows);
  const activeSources = ALL_SOURCE_FILTER_IDS.filter((id) => sourceFilterCount(countRows, id) > 0);

  if (variants.length === 0 && activeSources.length === 0) return null;

  function toggleVariant(key: string) {
    const next = new Set(selectedVariantKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onVariantKeysChange(next);
  }

  function selectStrongVariants() {
    onVariantKeysChange(defaultPublishVariantKeys(variants));
  }

  function selectAllVariants() {
    onVariantKeysChange(new Set(variants.map((v) => v.key)));
  }

  function clearVariants() {
    onVariantKeysChange(new Set());
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
      {variants.length > 0 ? (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">
              Névváltozatok a találatokban
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={selectStrongVariants}
                className="rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                Pontos + szóegyezés
              </button>
              <button
                type="button"
                onClick={selectAllVariants}
                className="rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                Összes
              </button>
              <button
                type="button"
                onClick={clearVariants}
                className="rounded-full bg-[var(--bg-secondary)] px-2.5 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                Egyik sem
              </button>
            </div>
          </div>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2">
            {variants.map((v: NameVariantOption) => {
              const on = selectedVariantKeys.has(v.key);
              return (
                <li key={v.key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bg-primary)]">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleVariant(v.key)}
                      className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent-primary)]"
                    />
                    <span className="text-sm text-[var(--text-primary)]">{nameVariantLabel(v)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
            Több névváltozat is kijelölhető. A „hasonló név” gyenge egyezés — alapból ki van kapcsolva.
            A jelentésbe csak a kijelölt változatokhoz tartozó dalok kerülnek (soronként is kihagyhatók).
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
