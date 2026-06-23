"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, MinusCircle } from "lucide-react";
import {
  buildEnrichStatusLegs,
  enrichStatusHeadline,
  type EnrichLegStatus,
  type EnrichStatusLeg,
} from "@/lib/audit-core/enrich-status";
import type { ArtistAuditMeta } from "@/lib/types";

function StatusIcon({ status }: { status: EnrichLegStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-[var(--accent-primary)]" aria-hidden />;
    case "done":
      return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" aria-hidden />;
    case "warn":
      return <AlertTriangle className="size-3.5 shrink-0 text-amber-600" aria-hidden />;
    case "skipped":
      return <MinusCircle className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />;
    default:
      return <Circle className="size-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden />;
  }
}

function LegRow({ leg }: { leg: EnrichStatusLeg }) {
  return (
    <li className="flex gap-2 py-1">
      <StatusIcon status={leg.status} />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[var(--text-primary)]">{leg.label}</p>
        <p className="text-[11px] leading-snug text-[var(--text-muted)]">{leg.detail}</p>
      </div>
    </li>
  );
}

export function EnrichStatusPanel({
  meta,
  enrichBusy,
}: {
  meta: ArtistAuditMeta | null | undefined;
  enrichBusy?: boolean;
}) {
  const busy = enrichBusy === true;
  const [tick, setTick] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (busy && !meta?.catalogEnrichReady) {
      if (startedAtRef.current === null) startedAtRef.current = Date.now();
    } else {
      startedAtRef.current = null;
    }
  }, [busy, meta?.catalogEnrichReady]);

  useEffect(() => {
    if (!busy || meta?.catalogEnrichReady) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 2000);
    return () => window.clearInterval(id);
  }, [busy, meta?.catalogEnrichReady]);

  const enrichElapsedMs =
    busy && startedAtRef.current ? Date.now() - startedAtRef.current : 0;
  void tick;

  const legs = buildEnrichStatusLegs(meta, busy, enrichElapsedMs);
  if (legs.length === 0) return null;

  const headline = enrichStatusHeadline(meta, busy, enrichElapsedMs);
  const iswcTotal = meta?.catalogEnrichIswcFilled ?? 0;

  return (
    <section
      className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5"
      aria-label="Metaadat scan állapot"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {headline}
        </h3>
        {meta?.catalogEnrichReady && iswcTotal > 0 ? (
          <span className="text-[10px] font-semibold tabular-nums text-emerald-600">
            {iswcTotal} sor ISWC
          </span>
        ) : null}
      </div>
      <ul className="divide-y divide-[var(--border)]/60">
        {legs.map((leg) => (
          <LegRow key={leg.id} leg={leg} />
        ))}
      </ul>
    </section>
  );
}
