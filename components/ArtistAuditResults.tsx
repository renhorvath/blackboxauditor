"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2 } from "lucide-react";
import { rowHasPayoutProblem, rowPayoutSummary, sortArtistAuditRows } from "@/lib/artist-audit-display";
import type { ArtistAuditMeta } from "@/lib/types";
import type { AuditRow, AuditSummary } from "@/lib/types";
import { isArtisjusSyntheticIsrc, isSyntheticAuditIsrc } from "@/lib/types";
import { CMO_SOURCE_LABELS } from "@/lib/cmo-types";
import type { CmoSourceId } from "@/lib/cmo-types";

function SourceBadge({
  label,
  active,
  title,
}: {
  label: string;
  active: boolean;
  title: string;
}) {
  if (!active) return null;
  return (
    <span
      title={title}
      className="inline-flex rounded-md bg-[color-mix(in_srgb,var(--accent-critical)_12%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-critical)]"
    >
      {label}
    </span>
  );
}

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

  const sorted = useMemo(
    () => (rows ? sortArtistAuditRows(rows) : []),
    [rows],
  );

  const visible = useMemo(
    () => (onlyProblems ? sorted.filter(rowHasPayoutProblem) : sorted),
    [sorted, onlyProblems],
  );

  const problemCount = useMemo(
    () => sorted.filter(rowHasPayoutProblem).length,
    [sorted],
  );

  if (loading) {
    return (
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="size-8 animate-spin text-[var(--accent-primary)]" aria-hidden />
          <p className="text-lg font-semibold text-[var(--text-primary)]">{artistName}</p>
          <p className="max-w-sm text-sm text-[var(--text-secondary)]">
            MLC unmatched + unclaimed TSV, ARTISJUS, európai CMO-k — hol nem jutott el a jogdíj.
          </p>
        </div>
      </section>
    );
  }

  if (!rows || !summary || !meta) return null;

  const sourceNote =
    meta.mlcScanSource === "live"
      ? "Friss adat az MLC TSV-ből."
      : meta.mlcScanSource === "cache"
        ? "Mentett MLC export (cache)."
        : "MLC export nem elérhető — ARTISJUS + CMO indexek.";

  const countsLineParts = [
    meta.mlcUnmatchedCount > 0 ? `${meta.mlcUnmatchedCount} MLC unmatched` : null,
    meta.mlcUnclaimedCount > 0 ? `${meta.mlcUnclaimedCount} MLC unclaimed` : null,
    meta.artisjusCount > 0 ? `${meta.artisjusCount} ARTISJUS` : null,
  ];
  if (meta.cmoCounts) {
    const cmoTotal = Object.values(meta.cmoCounts).reduce((a, b) => a + (b ?? 0), 0);
    if (cmoTotal > 0) countsLineParts.push(`${cmoTotal} európai CMO`);
  }
  const countsLine = countsLineParts.filter(Boolean).join(" · ");

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Előadó ellenőrzés
            </p>
            <h2 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{artistName}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
              {countsLine || "Nincs találat."} — {sourceNote}{" "}
              {problemCount === 0
                ? "Egyik forrás szerint sem találtunk kifizetési problémát."
                : `${problemCount} dalnál van gond legalább egy forrásban.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClearArtist}
            className="shrink-0 text-xs font-medium text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
          >
            Másik előadó
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOnlyProblems(true)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              onlyProblems
                ? "bg-[var(--accent-primary)] text-white"
                : "bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            Csak ahol van gond ({problemCount})
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
            Minden dal ({sorted.length})
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <CheckCircle2 className="mx-auto size-8 text-[var(--text-muted)]" aria-hidden />
          <p className="mt-3 font-medium text-[var(--text-primary)]">
            {onlyProblems
              ? "Nincs kifizetési gond a vizsgált dalokon."
              : "Nincs megjeleníthető dal."}
          </p>
          {onlyProblems && sorted.length > 0 ? (
            <button
              type="button"
              onClick={() => setOnlyProblems(false)}
              className="mt-2 text-sm font-semibold text-[var(--accent-primary)] underline-offset-2 hover:underline"
            >
              Mind a {sorted.length} dal megtekintése
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
          {visible.map((row) => {
            const hasProblem = rowHasPayoutProblem(row);
            const title = row.title ?? "(névtelen dal)";
            return (
              <li key={row.isrc} className="px-4 py-4">
                <div className="flex items-start gap-3">
                  {hasProblem ? (
                    <AlertCircle
                      className="mt-0.5 size-4 shrink-0 text-[var(--accent-critical)]"
                      aria-hidden
                    />
                  ) : (
                    <CheckCircle2
                      className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--text-primary)]">{title}</p>
                    {row.artist ? (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{row.artist}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <SourceBadge
                        label="ARTISJUS"
                        active={row.artisjusMatched === true}
                        title="Magyarországon lejátszották, de nem tudták kinek kifizetni"
                      />
                      <SourceBadge
                        label="MLC unmatched"
                        active={row.mlcMatchStatus === "unmatched"}
                        title="USA: a felvétel nincs műhöz párosítva az MLC-nél"
                      />
                      <SourceBadge
                        label="MLC unclaimed"
                        active={row.mlcUnclaimed === true}
                        title={
                          row.mlcUnclaimedPct != null
                            ? `USA: ${row.mlcUnclaimedPct}% mechanikai share claim nélkül`
                            : "USA: mechanikai share claim nélkül (black box)"
                        }
                      />
                      {(row.cmoHits ?? []).map((hit) => (
                        <SourceBadge
                          key={`${hit.source}:${hit.recordId}`}
                          label={CMO_SOURCE_LABELS[hit.source].replace(" (AT)", "").replace(" (NL)", "")}
                          active
                          title={`${CMO_SOURCE_LABELS[hit.source]} azonosítatlan listán`}
                        />
                      ))}
                      {isSyntheticAuditIsrc(row.isrc) ? (
                        <span className="inline-flex rounded-md bg-[var(--bg-secondary)] px-2 py-0.5 text-[11px] text-[var(--text-muted)]">
                          {isArtisjusSyntheticIsrc(row.isrc) ? "csak ARTISJUS-listán" : "csak CMO-listán"}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={`mt-2 text-sm leading-snug ${
                        hasProblem ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"
                      }`}
                    >
                      {rowPayoutSummary(row)}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {meta.mlcScanSource === "cache" ? (
          <details className="group text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-1 font-medium text-[var(--text-secondary)] marker:content-none [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden />
              Frissítés közvetlenül az MLC TSV-ből
            </summary>
            <div className="mt-2 space-y-2 pl-5">
              <p className="text-xs text-[var(--text-muted)]">
                A cache helyett újra beolvassa a 121 GB-os unmatchedresources.tsv fájlt (ripgrep). Több
                percig tarthat.
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
                    MLC TSV scan…
                  </span>
                ) : (
                  "MLC TSV újraszkennelése"
                )}
              </button>
            </div>
          </details>
        ) : meta.mlcScanSource === "live" ? (
          <p className="text-xs text-[var(--text-muted)]">Adatforrás: MLC unmatched TSV (friss scan).</p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">
            MLC export hiányzik — futtasd: python3 scripts/mlc/scan_tsv_by_artist.py --name „…"
          </p>
        )}

        <button
          type="button"
          onClick={onOpenReport}
          disabled={sorted.length === 0}
          className="shrink-0 rounded-[12px] bg-[var(--accent-primary)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-40"
        >
          Részletes jelentés ({sorted.length} dal)
        </button>
      </div>
    </section>
  );
}
