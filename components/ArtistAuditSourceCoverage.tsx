"use client";

import { AlertCircle, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import {
  buildAuditSourceCoverage,
  type AuditSourceCoverageStatus,
} from "@/lib/audit-source-labels";
import type { ArtistAuditMeta } from "@/lib/types";

function StatusIcon({ status }: { status: AuditSourceCoverageStatus }) {
  switch (status) {
    case "found":
      return (
        <AlertCircle
          className="size-4 shrink-0 text-[var(--accent-critical)]"
          aria-hidden
        />
      );
    case "clear":
      return (
        <CheckCircle2 className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
      );
    case "skipped":
      return (
        <MinusCircle className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
      );
    case "unavailable":
      return (
        <XCircle className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
      );
  }
}

export function ArtistAuditSourceCoverage({ meta }: { meta: ArtistAuditMeta }) {
  const items = buildAuditSourceCoverage(meta);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        Hol kerestük
      </p>
      <ul className="mt-3 space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 text-sm">
            <StatusIcon status={item.status} />
            <div className="min-w-0 flex-1">
              <span className="font-medium text-[var(--text-primary)]">{item.label}</span>
              <span
                className={
                  item.status === "found"
                    ? " text-[var(--accent-critical)]"
                    : " text-[var(--text-muted)]"
                }
              >
                {" "}
                — {item.detail}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
