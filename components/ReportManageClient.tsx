"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { PublishedReportPayload } from "@/lib/report-types";
import type { CaseFindingRow, CaseFindingStatus } from "@/lib/report-types";
import { PublishedReportView } from "@/components/PublishedReportView";

const STATUSES: CaseFindingStatus[] = [
  "open",
  "in_progress",
  "submitted",
  "resolved",
  "not_applicable",
];

export function ReportManageClient({ token }: { token: string }) {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [report, setReport] = useState<PublishedReportPayload | null>(null);
  const [findings, setFindings] = useState<CaseFindingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (authHeader: string) => {
    setBusy(true);
    setError(null);
    try {
      const [reportRes, findingsRes] = await Promise.all([
        fetch(`/api/reports/${token}`),
        fetch(`/api/reports/${token}/findings?manage=1`, {
          headers: { Authorization: authHeader },
        }),
      ]);
      if (!reportRes.ok || !findingsRes.ok) {
        throw new Error("Auth failed or report missing");
      }
      setReport((await reportRes.json()) as PublishedReportPayload);
      const fJson = (await findingsRes.json()) as { findings: CaseFindingRow[] };
      setFindings(fJson.findings);
      setAuthed(true);
    } catch {
      setError("Hibás operátori kulcs vagy hálózati hiba.");
      setAuthed(false);
    } finally {
      setBusy(false);
    }
  }, [token]);

  async function saveFinding(f: CaseFindingRow) {
    const authHeader = `Bearer ${secret}`;
    const res = await fetch(`/api/reports/${token}/findings`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        findingKey: f.findingKey,
        playbookId: f.playbookId,
        status: f.status,
        stepProgress: f.stepProgress,
        operatorNotes: f.operatorNotes,
        publicNote: f.publicNote,
      }),
    });
    if (!res.ok) {
      setError("Mentés sikertelen");
      return;
    }
    const updated = (await res.json()) as CaseFindingRow;
    setFindings((prev) =>
      prev.map((x) => (x.id === updated.id ? updated : x)),
    );
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-6">
        <h1 className="text-lg font-bold">Operátori nézet</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Add meg az <code className="text-xs">OPERATOR_SECRET</code> értékét.
        </p>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="input-bbox w-full px-3 py-2"
          placeholder="Operátori kulcs"
        />
        {error ? <p className="text-sm text-[var(--accent-critical)]">{error}</p> : null}
        <button
          type="button"
          disabled={busy || !secret}
          onClick={() => void load(`Bearer ${secret}`)}
          className="rounded-[10px] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Belépés"}
        </button>
        <Link href={`/r/${token}`} className="block text-sm text-[var(--accent-primary)]">
          ← Nyilvános jelentés
        </Link>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">Ügykezelés · {report.artistDisplayName}</h1>
        <Link href={`/r/${token}`} className="text-sm text-[var(--accent-primary)]">
          Nyilvános nézet
        </Link>
      </div>

      <PublishedReportView report={report} />

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
        <h2 className="font-semibold text-[var(--text-primary)]">Case állapotok</h2>
        <div className="mt-4 space-y-4">
          {findings.map((f) => (
            <div key={f.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
              <p className="text-xs font-mono text-[var(--text-muted)]">
                {f.findingKey} · {f.playbookId}
              </p>
              <label className="mt-2 block text-xs font-semibold text-[var(--text-muted)]">
                Státusz
              </label>
              <select
                value={f.status}
                onChange={(e) => {
                  const status = e.target.value as CaseFindingStatus;
                  setFindings((prev) =>
                    prev.map((x) => (x.id === f.id ? { ...x, status } : x)),
                  );
                }}
                className="input-bbox mt-1 w-full px-2 py-1.5 text-sm"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <label className="mt-2 block text-xs font-semibold text-[var(--text-muted)]">
                Belső jegyzet
              </label>
              <textarea
                value={f.operatorNotes ?? ""}
                onChange={(e) =>
                  setFindings((prev) =>
                    prev.map((x) =>
                      x.id === f.id ? { ...x, operatorNotes: e.target.value } : x,
                    ),
                  )
                }
                className="input-bbox mt-1 w-full px-2 py-1.5 text-sm"
                rows={2}
              />
              <label className="mt-2 block text-xs font-semibold text-[var(--text-muted)]">
                Publikus megjegyzés (előadó látja)
              </label>
              <textarea
                value={f.publicNote ?? ""}
                onChange={(e) =>
                  setFindings((prev) =>
                    prev.map((x) =>
                      x.id === f.id ? { ...x, publicNote: e.target.value } : x,
                    ),
                  )
                }
                className="input-bbox mt-1 w-full px-2 py-1.5 text-sm"
                rows={2}
              />
              <button
                type="button"
                onClick={() => void saveFinding(findings.find((x) => x.id === f.id) ?? f)}
                className="mt-2 rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-xs font-semibold"
              >
                Mentés
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
