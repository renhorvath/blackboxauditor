"use client";

import { Fragment, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AuditIssue, AuditRow } from "@/lib/types";
import { IssueTag } from "@/components/IssueTag";
import { ExportButton } from "@/components/ExportButton";

function issueSeverityRank(row: AuditRow): number {
  if (row.issues.some((i) => i.severity === "critical")) return 0;
  if (row.issues.some((i) => i.severity === "warning")) return 1;
  return 2;
}

function matchesFilter(row: AuditRow, filter: string): boolean {
  if (filter === "all") return true;
  if (filter === "critical") return row.issues.some((i) => i.severity === "critical");
  if (filter === "warning") return row.issues.some((i) => i.severity === "warning");
  return row.issues.some((i) => i.type === filter);
}

const ISSUE_LABELS: Record<AuditIssue["type"], string> = {
  no_iswc: "ISWC",
  no_mlc_match: "MLC match",
  not_in_mlc: "Nincs MLC",
  incomplete_shares: "Share hiányos",
  missing_shares: "Nincs share",
  over_allocated: "Over alloc",
  no_songwriter: "Szerző",
  missing_ipi_mlc: "IPI (MLC)",
  not_found: "Nincs adat",
  artisjus_unmatched: "ARTISJUS",
  artisjus_foreign_only: "KA/KM",
  artisjus_partial_rights: "Jogosult+",
};

type AugmentedRow = AuditRow & { _severity: number };

export function AuditTable({ data }: { data: AuditRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "_severity", desc: false },
  ]);
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const augmented = useMemo<AugmentedRow[]>(() => {
    return data.map((row) => ({
      ...row,
      _severity: issueSeverityRank(row),
    }));
  }, [data]);

  const filteredRows = useMemo(
    () => augmented.filter((row) => matchesFilter(row, filter)),
    [augmented, filter],
  );

  const columns = useMemo<ColumnDef<AugmentedRow>[]>(
    () => [
      {
        id: "_severity",
        accessorFn: (r) => r._severity,
        header: "",
        cell: () => null,
      },
      {
        accessorKey: "isrc",
        header: "ISRC",
        cell: (info) => {
          const value = String(info.getValue() ?? "");
          const display = value.startsWith("artisjus:")
            ? value.replace(/^artisjus:/, "műkód ")
            : value;
          return (
            <span className="font-mono text-[13px] text-[var(--text-primary)]">{display}</span>
          );
        },
      },
      {
        accessorKey: "title",
        header: "Cím",
        cell: (info) => (
          <span className="max-w-[220px] truncate">{String(info.getValue() ?? "—")}</span>
        ),
      },
      {
        accessorKey: "artist",
        header: "Előadó",
        cell: (info) => (
          <span className="max-w-[160px] truncate">{String(info.getValue() ?? "—")}</span>
        ),
      },
      {
        accessorKey: "iswc",
        header: "ISWC",
        cell: (info) => (
          <span className="font-mono text-[12px]">{String(info.getValue() ?? "—")}</span>
        ),
      },
      {
        accessorKey: "mlcMatchStatus",
        header: "MLC",
        cell: (info) => (
          <span className="font-mono text-[12px] uppercase">
            {String(info.getValue() ?? "—")}
          </span>
        ),
      },
      {
        accessorKey: "shareTotal",
        header: "Share %",
        cell: (info) => {
          const v = info.getValue() as number | null;
          return (
            <span className="tabular-nums">{v != null ? `${v}%` : "—"}</span>
          );
        },
      },
      {
        id: "artisjus",
        header: "ARTISJUS",
        cell: ({ row }) => {
          if (row.original.artisjusMatched) {
            return (
              <span className="font-mono text-[12px] text-[var(--accent-critical)]">
                listán
              </span>
            );
          }
          return <span className="text-[var(--text-muted)]">—</span>;
        },
      },
      {
        id: "issues",
        header: "Problémák",
        cell: ({ row }) => (
          <div className="flex max-w-[280px] flex-wrap gap-1">
            {row.original.issues.length === 0 ? (
              <IssueTag severity="info">Rendben</IssueTag>
            ) : (
              row.original.issues.map((issue, idx) => (
                <IssueTag key={`${issue.type}-${idx}`} severity={issue.severity}>
                  {ISSUE_LABELS[issue.type]}
                </IssueTag>
              ))
            )}
          </div>
        ),
      },
      {
        id: "expand",
        header: "",
        cell: ({ row }) => {
          const open = expanded === row.original.isrc;
          return (
            <button
              type="button"
              className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              aria-expanded={open}
              onClick={() => setExpanded(open ? null : row.original.isrc)}
            >
              {open ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          );
        },
      },
    ],
    [expanded],
  );

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table hook is intentional here
  const table = useReactTable({
    data: filteredRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const exportRows = table.getRowModel().rows.map((r) => {
    const { _severity, ...row } = r.original;
    void _severity;
    return row as AuditRow;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-mono text-xs text-[var(--text-secondary)]">
          Szűrő
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 font-mono text-xs text-[var(--text-primary)]"
          >
            <option value="all">Összes</option>
            <option value="critical">Csak kritikus</option>
            <option value="warning">Csak figyelmeztetés</option>
            <option value="no_iswc">ISWC hiány</option>
            <option value="no_mlc_match">MLC unmatched</option>
            <option value="not_in_mlc">Nincs MLC</option>
            <option value="incomplete_shares">Hiányos share</option>
            <option value="missing_shares">Nincs share audit</option>
            <option value="over_allocated">Over-allocated</option>
            <option value="missing_ipi_mlc">Hiányzó IPI</option>
            <option value="no_songwriter">Nincs szerző</option>
            <option value="artisjus_unmatched">ARTISJUS listán</option>
            <option value="not_found">Nem található</option>
          </select>
        </label>
        <ExportButton rows={exportRows} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead className="bg-[var(--bg-secondary)] font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  if (header.column.id === "_severity") return null;
                  return (
                    <th key={header.id} className="border-b border-[var(--border)] px-3 py-2">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row: Row<AugmentedRow>) => {
              const open = expanded === row.original.isrc;
              const colCount = row.getVisibleCells().filter(
                (c) => c.column.id !== "_severity",
              ).length;
              return (
                <Fragment key={row.id}>
                  <tr className="border-b border-[var(--border)]">
                    {row.getVisibleCells().map((cell) => {
                      if (cell.column.id === "_severity") return null;
                      return (
                        <td
                          key={cell.id}
                          className="max-w-[1px] px-3 py-2 align-middle text-[var(--text-secondary)]"
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      );
                    })}
                  </tr>
                  {open ? (
                    <tr className="bg-[var(--bg-secondary)]">
                      <td colSpan={colCount} className="px-4 py-4 text-[var(--text-secondary)]">
                        <RowDetail row={row.original} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowDetail({ row }: { row: AuditRow }) {
  const batch = row.rawBatchData as {
    data?: {
      mlc_portal_url?: string | null;
      songwriters?: unknown[];
      publishers?: unknown[];
      sources?: string[];
      missing_fields?: string[];
      iswc?: string | null;
    };
  };
  const portal = batch?.data?.mlc_portal_url;
  const apiSongwriters = formatSongwritersFromBatch(batch?.data?.songwriters);
  const apiPublishers = formatPublishersDeduped(batch?.data?.publishers);
  const sourcesHuman = humanizeCreditsFmSources(batch?.data?.sources);
  const src = batch?.data?.sources ?? [];
  const hasMb = src.includes("musicbrainz");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
          Részletek
        </p>

        {apiSongwriters.length > 0 ? (
          <div className="rounded-md border border-[var(--border-active)] bg-[var(--bg-primary)] p-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--accent-primary)]">
              Ki írta? — szerzők (Credits.fm API)
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--text-primary)]">
              {apiSongwriters.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {apiPublishers.length > 0 ? (
          <div className="rounded-md border border-[var(--border-active)] bg-[var(--bg-primary)] p-3">
            <p className="font-mono text-[11px] uppercase tracking-wide text-[var(--accent-primary)]">
              Ki adja ki? — publishers („Who publishes this song?”)
            </p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-[var(--text-primary)]">
              {apiPublishers.map((line, idx) => (
                <li key={idx}>{line}</li>
              ))}
            </ul>
            {sourcesHuman ? (
              <p className="mt-3 border-t border-[var(--border)] pt-2 font-mono text-[11px] text-[var(--text-secondary)]">
                Források (API <code className="text-[10px]">sources</code>):{" "}
                <span className="text-[var(--text-primary)]">{sourcesHuman}</span>
                {hasMb ? (
                  <span className="ml-2 text-[var(--accent-primary)]" title="Szerepel a válaszban">
                    ✓ MusicBrainz
                  </span>
                ) : null}
              </p>
            ) : null}
            {row.mlcMatchStatus === "matched" ? (
              <p className="mt-2 font-mono text-[11px] text-[var(--accent-primary)]">
                ✓ MLC — audit: matched (a webes „2 sources” részét az MLC egyezés és a források együtt adják)
              </p>
            ) : row.mlcMatchStatus === "unmatched" ? (
              <p className="mt-2 font-mono text-[11px] text-[var(--accent-warning)]">
                MLC (audit): unmatched
              </p>
            ) : row.mlcMatchStatus === "not_in_mlc" ? (
              <p className="mt-2 font-mono text-[11px] text-[var(--accent-warning)]">
                MLC (audit): nincs az MLC indexben
              </p>
            ) : null}
            <p className="mt-2 text-[11px] leading-snug text-[var(--text-muted)]">
              A webes Credit Chain grafikusan jelzi a forrásokat; itt az API mezők és az MLC audit látszik.
            </p>
          </div>
        ) : null}

        {apiPublishers.length === 0 && src.length > 0 ? (
          <p className="font-mono text-[11px] text-[var(--text-muted)]">
            API források: {sourcesHuman ?? src.join(", ")}
          </p>
        ) : null}

        {batch?.data?.missing_fields && batch.data.missing_fields.length > 0 ? (
          <p className="font-mono text-[11px] text-[var(--accent-warning)]">
            API szerinti hiányok: {batch.data.missing_fields.join(", ")}
          </p>
        ) : null}

        <ul className="space-y-3">
          {row.issues.length === 0 ? (
            <li className="text-sm text-[var(--text-secondary)]">
              Nem azonosítottunk blokkoló problémát ehhez az ISRC-hez.
            </li>
          ) : (
            row.issues.map((issue, i) => (
              <li key={i} className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                <div className="mb-1 flex items-center gap-2">
                  <IssueTag severity={issue.severity}>{ISSUE_LABELS[issue.type]}</IssueTag>
                </div>
                <p className="text-sm text-[var(--text-primary)]">{issue.message}</p>
                <p className="mt-2 font-mono text-[11px] text-[var(--accent-muted)]">
                  Javaslat: {issue.action}
                </p>
              </li>
            ))
          )}
        </ul>
      </div>
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">
          Linkek
        </p>
        <div className="flex flex-col gap-2 text-sm">
          <a
            className="text-[var(--accent-muted)] underline-offset-4 hover:underline"
            href={`https://credits.fm/isrc/${encodeURIComponent(row.isrc)}`}
            target="_blank"
            rel="noreferrer"
          >
            credits.fm — ISRC nézet
          </a>
          {row.iswc ? (
            <a
              className="text-[var(--accent-muted)] underline-offset-4 hover:underline"
              href={`https://credits.fm/iswc/${encodeURIComponent(row.iswc)}`}
              target="_blank"
              rel="noreferrer"
            >
              credits.fm — ISWC (mű) nézet
            </a>
          ) : null}
          {portal ? (
            <a
              className="text-[var(--accent-muted)] underline-offset-4 hover:underline"
              href={portal}
              target="_blank"
              rel="noreferrer"
            >
              MLC portal (API szerint)
            </a>
          ) : (
            <span className="text-[var(--text-muted)]">MLC portal URL nincs az API válaszban.</span>
          )}
        </div>
        <details className="mt-4 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-3">
          <summary className="cursor-pointer font-mono text-xs text-[var(--text-muted)]">
            Nyers batch válasz (debug)
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto font-mono text-[10px] text-[var(--text-secondary)]">
            {JSON.stringify(row.rawBatchData, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function formatSongwritersFromBatch(list: unknown[] | undefined): string[] {
  if (!list?.length) return [];
  const lines: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const role = String(o.role ?? "").trim();
    const ipi = String(o.ipi ?? "").trim();
    const shareRaw = o.share_percentage ?? o.sharePercentage;
    const share =
      shareRaw != null && shareRaw !== ""
        ? String(shareRaw)
        : "";
    if (!name && !ipi) continue;
    const bits = [
      name || "(névtelen)",
      role ? `— ${role}` : "",
      ipi ? `(IPI ${ipi})` : "",
      share ? `${share}%` : "",
    ].filter(Boolean);
    lines.push(bits.join(" "));
  }
  return lines;
}

function formatPublishersDeduped(list: unknown[] | undefined): string[] {
  if (!list?.length) return [];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const role = String(o.role ?? "").trim();
    const ipi = String(o.ipi ?? "").trim();
    const shareRaw = o.share_percentage ?? o.sharePercentage;
    const share =
      shareRaw != null && shareRaw !== ""
        ? String(shareRaw)
        : "";
    if (!name && !ipi) continue;
    const key = `${name.toUpperCase()}|${role.toUpperCase()}|${ipi}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bits = [
      name || "(névtelen)",
      role ? `— ${role}` : "",
      ipi ? `(IPI ${ipi})` : "",
      share ? `${share}%` : "",
    ].filter(Boolean);
    lines.push(bits.join(" "));
  }
  return lines;
}

const CREDITS_FM_SOURCE_LABELS: Record<string, string> = {
  credits_db: "Credits DB",
  notes_credits_api: "Notes Credits API",
  musicbrainz: "MusicBrainz",
  mlc: "MLC",
};

function humanizeCreditsFmSources(sources: string[] | undefined): string | null {
  if (!sources?.length) return null;
  return sources
    .map((s) => CREDITS_FM_SOURCE_LABELS[s] ?? s.replace(/_/g, " "))
    .join(" · ");
}
