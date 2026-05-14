"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AuditSummaryCards } from "@/components/AuditSummary";
import { AuditTable } from "@/components/AuditTable";
import type { StoredAuditPayload } from "@/lib/types";
import { SESSION_STORAGE_KEY } from "@/lib/types";

export default function AuditPage() {
  const [payload, setPayload] = useState<StoredAuditPayload | null | undefined>(
    undefined,
  );

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) {
          setPayload(null);
          return;
        }
        const parsed = JSON.parse(raw) as StoredAuditPayload;
        if (!parsed.rows || !parsed.summary) {
          setPayload(null);
          return;
        }
        setPayload(parsed);
      } catch {
        setPayload(null);
      }
    });
  }, []);

  if (payload === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-24 text-[var(--text-secondary)]">
        Betöltés…
      </div>
    );
  }

  if (payload === null) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 px-6 py-24 text-center">
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Nincs audit eredmény ebben a böngészőlapon. Indíts auditot a kezdőlapon.
        </p>
        <Link
          href="/"
          className="rounded-[12px] bg-[var(--accent-primary)] px-4 py-3 text-center text-sm font-semibold text-white hover:brightness-105"
        >
          Vissza a keresőhöz
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
            bbox audit
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
            Összesítés és részletek
          </h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Generálva: {new Date(payload.generatedAt).toLocaleString("hu-HU")}
          </p>
          {payload.contactEmail ? (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Megadott e-mail (munkamenet):{" "}
              <span className="font-medium text-[var(--text-primary)]">{payload.contactEmail}</span>
            </p>
          ) : null}
        </div>
        <Link
          href="/"
          className="text-sm font-medium text-[var(--accent-primary)] underline-offset-4 hover:underline"
        >
          Új keresés
        </Link>
      </header>

      <AuditSummaryCards summary={payload.summary} />
      <AuditTable data={payload.rows} />
    </div>
  );
}
