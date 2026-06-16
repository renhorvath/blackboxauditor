"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, LogOut, RefreshCw } from "lucide-react";
import type { AdminReportListItem } from "@/lib/report-types";
import { OPERATOR_SECRET_STORAGE_KEY } from "@/lib/report-types";

/** Accepts a bare token or a pasted /r/<token>(/manage) URL and returns the token. */
function extractToken(raw: string): string {
  const value = raw.trim();
  const match = value.match(/\/r\/([^/?#\s]+)/);
  if (match) return match[1];
  return value;
}

export function OperatorConsole() {
  const router = useRouter();
  const [secret, setSecret] = useState("");
  const [authed, setAuthed] = useState(false);
  const [reports, setReports] = useState<AdminReportListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [bootstrapping, setBootstrapping] = useState(true);

  const load = useCallback(async (key: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reports", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) throw new Error("auth");
      const data = (await res.json()) as { reports: AdminReportListItem[] };
      setReports(data.reports);
      setAuthed(true);
      sessionStorage.setItem(OPERATOR_SECRET_STORAGE_KEY, key);
      return true;
    } catch {
      setError("Hibás kulcs vagy nem elérhető az adatbázis.");
      setAuthed(false);
      sessionStorage.removeItem(OPERATOR_SECRET_STORAGE_KEY);
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setBaseUrl(window.location.origin);
    const stored = sessionStorage.getItem(OPERATOR_SECRET_STORAGE_KEY);
    if (stored) {
      setSecret(stored);
      void load(stored).finally(() => setBootstrapping(false));
    } else {
      setBootstrapping(false);
    }
  }, [load]);

  function logout() {
    sessionStorage.removeItem(OPERATOR_SECRET_STORAGE_KEY);
    setAuthed(false);
    setSecret("");
    setReports([]);
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/admin/reports?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (res.ok) {
      setReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, revokedAt: new Date().toISOString() } : r)),
      );
    }
  }

  function openToken() {
    const token = extractToken(tokenInput);
    if (!token) return;
    router.push(`/r/${encodeURIComponent(token)}`);
  }

  const heroEyebrow = (
    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
      BBOX AUDIT · OPERÁTOR
    </p>
  );

  if (bootstrapping) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--text-secondary)]">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="mx-auto w-full max-w-xl px-6 pb-20 pt-16 md:pt-24">
        <div className="text-center">
          {heroEyebrow}
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl">
            Operátori felület
          </h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-[var(--text-secondary)]">
            Az auditok az adatgépen készülnek. Itt a publikált jelentéseket éred el,
            kezeled és osztod meg az ügyfelekkel.
          </p>
        </div>

        <form
          className="mx-auto mt-10 max-w-sm space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-6 py-7 shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
          onSubmit={(e) => {
            e.preventDefault();
            void load(secret);
          }}
        >
          <label className="block text-sm font-medium text-[var(--text-secondary)]">
            Operátori kulcs
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="input-bbox w-full px-3.5 py-2.5"
            placeholder="OPERATOR_SECRET"
            autoFocus
          />
          {error ? (
            <p className="text-sm text-[var(--accent-critical)]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !secret.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Belépés
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-[var(--text-muted)]">
          Van jelentés-linked?{" "}
          <Link href="/audit" className="text-[var(--accent-primary)] underline-offset-4 hover:underline">
            Korábbi jelentés megnyitása
          </Link>
        </p>
      </div>
    );
  }

  const active = reports.filter((r) => !r.revokedAt);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 pb-20 pt-10 md:pt-14">
      <div className="flex items-start justify-between gap-4">
        <div>
          {heroEyebrow}
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Operátori felület
          </h1>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
        >
          <LogOut className="size-3.5" aria-hidden />
          Kilépés
        </button>
      </div>

      <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-5 py-5">
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          Jelentés megnyitása token vagy link alapján
        </label>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <input
            type="text"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="token vagy /r/…"
            className="input-bbox min-w-0 flex-1 px-3.5 py-2.5"
            onKeyDown={(e) => {
              if (e.key === "Enter") openToken();
            }}
          />
          <button
            type="button"
            onClick={openToken}
            disabled={!tokenInput.trim()}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            Megnyitás
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Publikált jelentések ({active.length} aktív / {reports.length})
        </h2>
        <button
          type="button"
          onClick={() => void load(secret)}
          disabled={busy}
          className="flex items-center gap-1.5 text-xs font-semibold text-[var(--accent-primary)] disabled:opacity-40"
        >
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
          Frissítés
        </button>
      </div>

      {reports.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
          Még nincs publikált jelentés. Az adatgépen futtass auditot, majd publikálj egy
          jelentést — itt fog megjelenni.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {reports.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-semibold text-[var(--text-primary)]">
                  {r.artistDisplayName}
                  {r.revokedAt ? (
                    <span className="ml-2 text-xs font-normal text-[var(--accent-critical)]">
                      visszavonva
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {new Date(r.publishedAt).toLocaleString("hu-HU")} · {r.findingCount} találat
                </p>
                <a
                  href={`${baseUrl}/r/${r.token}`}
                  className="text-xs text-[var(--accent-primary)]"
                >
                  /r/{r.token.slice(0, 8)}…
                </a>
              </div>
              <div className="flex shrink-0 gap-2">
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
      )}

      <p className="mt-10 rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-xs leading-relaxed text-[var(--text-secondary)]">
        Az audit-motor (MLC, ARTISJUS, EU CMO listák) az adatgépen fut. Új jelentés
        készítéséhez ott indíts auditot, majd publikálj — a link és a kezelőfelület itt
        jelenik meg.
      </p>
    </div>
  );
}
