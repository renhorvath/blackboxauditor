"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
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
  allRows = [],
  countRows = [],
  selectedVariantKeys,
  onVariantKeysChange,
  enabledSources,
  onToggleSource,
  onSelectOnlySource,
  variantOptions,
  sourceCount,
  publishedMode = false,
  compact = false,
}: {
  query: string;
  allRows?: AuditRow[];
  countRows?: AuditRow[];
  selectedVariantKeys: ReadonlySet<string>;
  onVariantKeysChange: (keys: Set<string>) => void;
  enabledSources: ReadonlySet<AuditSourceFilterId>;
  onToggleSource: (id: AuditSourceFilterId) => void;
  onSelectOnlySource: (id: AuditSourceFilterId) => void;
  variantOptions?: NameVariantOption[];
  sourceCount?: (id: AuditSourceFilterId) => number;
  publishedMode?: boolean;
  compact?: boolean;
}) {
  const [variantsOpen, setVariantsOpen] = useState(!compact);
  const variants = variantOptions ?? collectNameVariants(query, allRows);
  const countFor = sourceCount ?? ((id: AuditSourceFilterId) => sourceFilterCount(countRows, id));
  const activeSources = ALL_SOURCE_FILTER_IDS.filter((id) => countFor(id) > 0);

  if (variants.length === 0 && activeSources.length === 0) return null;

  function toggleVariant(key: string) {
    const next = new Set(selectedVariantKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onVariantKeysChange(next);
  }

  return (
    <div className="space-y-3">
      {variants.length > 0 ? (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
          <button
            type="button"
            onClick={() => setVariantsOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-xs font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
          >
            <span>
              Névváltozatok ({selectedVariantKeys.size}/{variants.length})
            </span>
            <ChevronDown className={`size-4 transition ${variantsOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {variantsOpen ? (
            <div className="border-t border-[var(--border)] px-3 py-2">
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => onVariantKeysChange(defaultPublishVariantKeys(variants))}
                  className="rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]"
                >
                  Ajánlott
                </button>
                <button
                  type="button"
                  onClick={() => onVariantKeysChange(new Set(variants.map((v) => v.key)))}
                  className="rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]"
                >
                  Összes
                </button>
                <button
                  type="button"
                  onClick={() => onVariantKeysChange(new Set())}
                  className="rounded-md bg-[var(--bg-secondary)] px-2 py-1 text-[10px] font-semibold text-[var(--text-muted)]"
                >
                  Törlés
                </button>
              </div>
              <ul className="max-h-36 space-y-0.5 overflow-y-auto">
                {variants.map((v: NameVariantOption) => {
                  const on = selectedVariantKeys.has(v.key);
                  return (
                    <li key={v.key}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--bg-secondary)]">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggleVariant(v.key)}
                          className="size-3.5 accent-[var(--accent-primary)]"
                        />
                        <span className="text-xs text-[var(--text-primary)]">{nameVariantLabel(v)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
              {!publishedMode ? (
                <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
                  A jelentésbe csak a kijelölt névváltozatok kerülnek.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {activeSources.length > 0 ? (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Forrás
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeSources.map((id) => {
              const on = enabledSources.has(id);
              const count = countFor(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onToggleSource(id)}
                  onDoubleClick={() => onSelectOnlySource(id)}
                  title="Dupla katt: csak ez"
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    on
                      ? "bg-[var(--accent-primary)] text-white"
                      : "bg-[var(--bg-secondary)] text-[var(--text-muted)] line-through opacity-50"
                  }`}
                >
                  {SOURCE_FILTER_LABELS[id]} {count}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
