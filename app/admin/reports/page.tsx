"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { AdminReportListItem } from "@/lib/report-types";

export default function AdminReportsPage() {
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [reports, setReports] = useState<AdminReportListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");

  useEffect(() => {
    setBaseUrl(window.location.origin);
  }, []);

  const load = useCallback(async (authHeader: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports", {
        headers: { Authorization: authHeader },
      });
      if (!res.ok) throw new Error("auth");
      const data = (await res.json()) as { reports: AdminReportListItem[] };
      setReports(data.reports);
      setAuthed(true);
    } catch {
      setError("Hibás kulcs.");
      setAuthed(false);
    } finally {
      setBusy(false);
    }
  }, []);

  async function revoke(id: string) {
    const res = await fetch(`/api/admin/reports?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (res.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
    }
  }

  if (!authed) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-6 py-10">
        <h1 className="text-xl font-bold">Publisholt jelentések</h1>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="input-bbox w-full px-3 py-2"
          placeholder="OPERATOR_SECRET"
        />
        {error ? <p className="text-sm text-[var(--accent-critical)]">{error}</p> : null}
        <button
          type="button"
          disabled={busy || !secret}
          onClick={() => void load(`Bearer ${secret}`)}
          className="rounded-[10px] bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white"
        >
          Belépés
        </button>
        <Link href="/" className="block text-sm text-[var(--accent-primary)]">
          ← Főoldal
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-bold">Publisholt jelentések</h1>
      {busy ? <Loader2 className="size-5 animate-spin" /> : null}
      <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
        {reports.map((r) => (
          <li key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{r.artistDisplayName}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {new Date(r.publishedAt).toLocaleString("hu-HU")} · {r.findingCount} találat
                {r.revokedAt ? " · visszavonva" : ""}
              </p>
              <a
                href={`${baseUrl}/r/${r.token}`}
                className="text-xs text-[var(--accent-primary)]"
              >
                /r/{r.token.slice(0, 8)}…
              </a>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/r/${r.token}/manage`}
                className="rounded-[8px] border border-[var(--border)] px-3 py-1 text-xs font-semibold"
              >
                Kezelés
              </Link>
              {!r.revokedAt ? (
                <button
                  type="button"
                  onClick={() => void revoke(r.id)}
                  className="rounded-[8px] border border-[var(--accent-critical)] px-3 py-1 text-xs font-semibold text-[var(--accent-critical)]"
                >
                  Visszavonás
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <Link href="/" className="text-sm text-[var(--accent-primary)]">
        ← Főoldal
      </Link>
    </div>
  );
}
