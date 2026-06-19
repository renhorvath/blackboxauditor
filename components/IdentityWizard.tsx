"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, UserCog, X } from "lucide-react";
import type {
  ArtistContext,
  IdentityProposals,
  IdentityStatus,
} from "@/lib/audit-core/artist-context-types";
import { OPERATOR_SECRET_STORAGE_KEY } from "@/lib/report-types";
import type { AuditRow } from "@/lib/types";

function identityHeaders(): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const secret = sessionStorage.getItem(OPERATOR_SECRET_STORAGE_KEY)?.trim();
    if (secret) headers["x-operator-secret"] = secret;
  } catch {
    /* ignore */
  }
  return headers;
}

export function IdentityStatusBanner({
  status,
  storageAvailable,
  onOpenWizard,
}: {
  status: IdentityStatus | null;
  storageAvailable: boolean;
  onOpenWizard: () => void;
}) {
  if (!status || status === "skipped") return null;

  const tone =
    status === "resolved"
      ? "border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10"
      : status === "auto"
        ? "border-[var(--border)] bg-[var(--bg-secondary)]"
        : "border-[var(--accent-warning)]/50 bg-[var(--accent-warning)]/10";

  const label =
    status === "resolved"
      ? "Identitás feloldva (ops)"
      : status === "auto"
        ? "Identitás egyértelmű — wizard opcionális"
        : "Identitás ellenőrzés szükséges (ops)";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${tone}`}>
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{label}</p>
        {!storageAvailable ? (
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Mentés csak helyi adatgépen — Vercelen csak javaslatok.
          </p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOpenWizard}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--bg-primary)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] ring-1 ring-[var(--border)] hover:bg-[var(--bg-elevated)]"
      >
        <UserCog className="size-4" aria-hidden />
        Identity wizard
      </button>
    </div>
  );
}

export function useArtistIdentity({
  enabled,
  artistName,
  spotifyId,
  rows,
}: {
  enabled: boolean;
  artistName: string;
  spotifyId?: string | null;
  rows: AuditRow[] | null;
}) {
  const [status, setStatus] = useState<IdentityStatus | null>(null);
  const [proposals, setProposals] = useState<IdentityProposals | null>(null);
  const [context, setContext] = useState<ArtistContext | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rowKey = useMemo(
    () => (rows ? `${rows.length}:${rows[0]?.isrc ?? ""}` : ""),
    [rows],
  );

  useEffect(() => {
    if (!enabled || !artistName || !rows?.length) {
      setStatus(null);
      setProposals(null);
      setContext(null);
      return;
    }

    let cancelled = false;
    setBusy(true);
    setError(null);

    void fetch("/api/artist-identity", {
      method: "POST",
      headers: identityHeaders(),
      body: JSON.stringify({
        action: "propose",
        artistName,
        spotifyId,
        rows,
      }),
    })
      .then(async (res) => {
        const data = (await res.json()) as {
          status?: IdentityStatus;
          proposals?: IdentityProposals;
          context?: ArtistContext | null;
          storageAvailable?: boolean;
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Identitás lekérdezés sikertelen.");
        if (cancelled) return;
        setStatus(data.status ?? null);
        setProposals(data.proposals ?? null);
        setContext(data.context ?? null);
        setStorageAvailable(data.storageAvailable !== false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Hiba");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, artistName, spotifyId, rowKey, rows]);

  async function saveIdentity(input: {
    excludeAliases: string[];
    aliases: string[];
    legalName: string | null;
    ipi: string | null;
  }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/artist-identity", {
        method: "POST",
        headers: identityHeaders(),
        body: JSON.stringify({
          action: "save",
          artistName,
          spotifyId,
          rows,
          ...input,
        }),
      });
      const data = (await res.json()) as {
        status?: IdentityStatus;
        proposals?: IdentityProposals;
        context?: ArtistContext;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Mentés sikertelen.");
      setStatus(data.status ?? "resolved");
      setProposals(data.proposals ?? proposals);
      setContext(data.context ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mentés sikertelen.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return {
    status,
    proposals,
    context,
    storageAvailable,
    busy,
    error,
    saveIdentity,
    refresh: () => setStatus((s) => s),
  };
}

type WizardStep = "exclude" | "legal" | "ipi";

export function IdentityWizard({
  open,
  onClose,
  artistName,
  proposals,
  context,
  storageAvailable,
  busy,
  error,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  artistName: string;
  proposals: IdentityProposals | null;
  context: ArtistContext | null;
  storageAvailable: boolean;
  busy: boolean;
  error: string | null;
  onSave: (input: {
    excludeAliases: string[];
    aliases: string[];
    legalName: string | null;
    ipi: string | null;
  }) => Promise<void>;
}) {
  const [step, setStep] = useState<WizardStep>("exclude");
  const [excludeAliases, setExcludeAliases] = useState<Set<string>>(() => new Set());
  const [aliases, setAliases] = useState<Set<string>>(() => new Set());
  const [legalName, setLegalName] = useState("");
  const [ipi, setIpi] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !proposals) return;
    setStep("exclude");
    const defaultExclude = new Set(
      proposals.excludeAliasCandidates.map((c) => c.value),
    );
    if (context?.excludeAliases.length) {
      for (const v of context.excludeAliases) defaultExclude.add(v);
    }
    setExcludeAliases(defaultExclude);

    const defaultAliases = new Set(proposals.aliasCandidates.map((c) => c.value));
    if (context?.aliases.length) {
      for (const v of context.aliases) defaultAliases.add(v);
    }
    setAliases(defaultAliases);

    setLegalName(
      context?.legalName ??
        proposals.legalNames[0]?.value ??
        "",
    );
    setIpi(context?.ipi ?? proposals.ipis[0]?.value ?? "");
    setSaveError(null);
  }, [open, proposals, context]);

  if (!open) return null;

  const steps: WizardStep[] = ["exclude", "legal", "ipi"];
  const stepIndex = steps.indexOf(step);

  async function handleFinish() {
    setSaveError(null);
    if (!storageAvailable) {
      onClose();
      return;
    }
    try {
      await onSave({
        excludeAliases: [...excludeAliases],
        aliases: [...aliases],
        legalName: legalName.trim() || null,
        ipi: ipi.trim() || null,
      });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Mentés sikertelen.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
        role="dialog"
        aria-labelledby="identity-wizard-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              Ops · Fázis 0
            </p>
            <h2 id="identity-wizard-title" className="text-lg font-semibold text-[var(--text-primary)]">
              Identity wizard
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">{artistName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--text-muted)] hover:bg-[var(--bg-secondary)]"
            aria-label="Bezárás"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-[var(--border)] px-5 py-3">
          {steps.map((id, idx) => (
            <button
              key={id}
              type="button"
              onClick={() => setStep(id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                step === id
                  ? "bg-[var(--accent-primary)] text-white"
                  : idx <= stepIndex
                    ? "bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    : "text-[var(--text-muted)]"
              }`}
            >
              {id === "exclude" ? "1. Alias" : id === "legal" ? "2. Jogi név" : "3. IPI"}
            </button>
          ))}
        </div>

        <div className="space-y-4 px-5 py-4">
          {error ? (
            <p className="rounded-lg border border-[var(--accent-warning)]/50 bg-[var(--accent-warning)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
              {error}
            </p>
          ) : null}
          {saveError ? (
            <p className="rounded-lg border border-[var(--accent-warning)]/50 bg-[var(--accent-warning)]/10 px-3 py-2 text-sm text-[var(--text-primary)]">
              {saveError}
            </p>
          ) : null}

          {step === "exclude" ? (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Jelöld a kizárandó neveket (pl. kollaborátor, más előadó — Mr. Bizz).
              </p>
              {proposals?.excludeAliasCandidates.length ? (
                <ul className="space-y-2">
                  {proposals.excludeAliasCandidates.map((c) => (
                    <li key={c.value}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] px-3 py-2 hover:bg-[var(--bg-secondary)]">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={excludeAliases.has(c.value)}
                          onChange={(e) => {
                            setExcludeAliases((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(c.value);
                              else next.delete(c.value);
                              return next;
                            });
                          }}
                        />
                        <span>
                          <span className="font-medium text-[var(--text-primary)]">{c.value}</span>
                          <span className="mt-0.5 block font-mono text-[10px] text-[var(--text-muted)]">
                            {c.votes} találat · {c.sources.join(", ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Nincs kizárási jelölt.</p>
              )}
              {proposals?.aliasCandidates.length ? (
                <div className="pt-2">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    Művésznév aliasok (opcionális)
                  </p>
                  <ul className="space-y-2">
                    {proposals.aliasCandidates.map((c) => (
                      <li key={c.value}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2">
                          <input
                            type="checkbox"
                            checked={aliases.has(c.value)}
                            onChange={(e) => {
                              setAliases((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(c.value);
                                else next.delete(c.value);
                                return next;
                              });
                            }}
                          />
                          <span className="text-sm text-[var(--text-primary)]">
                            {c.value} <span className="text-[var(--text-muted)]">({c.votes})</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          ) : null}

          {step === "legal" ? (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Válaszd ki a jogi nevet (writer szavazás credits.fm / CMO mezőkből).
              </p>
              {proposals?.legalNames.length ? (
                <ul className="space-y-2">
                  {proposals.legalNames.map((c) => (
                    <li key={c.value}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] px-3 py-2 hover:bg-[var(--bg-secondary)]">
                        <input
                          type="radio"
                          name="legal-name"
                          className="mt-1"
                          checked={legalName === c.value}
                          onChange={() => setLegalName(c.value)}
                        />
                        <span>
                          <span className="font-medium text-[var(--text-primary)]">{c.value}</span>
                          <span className="mt-0.5 block font-mono text-[10px] text-[var(--text-muted)]">
                            {c.votes} szavazat · {c.sources.join(", ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">
                  Nincs writer jelölt az audit sorokban (credits.fm enrich később).
                </p>
              )}
              <label className="block text-sm">
                <span className="text-[var(--text-secondary)]">Kézi jogi név</span>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-[var(--text-primary)]"
                  placeholder="pl. Topa Ferenc"
                />
              </label>
            </>
          ) : null}

          {step === "ipi" ? (
            <>
              <p className="text-sm text-[var(--text-secondary)]">
                Válaszd ki az IPI name number-t (CISAC / credits.fm szavazás).
              </p>
              {proposals?.ipis.length ? (
                <ul className="space-y-2">
                  {proposals.ipis.map((c) => (
                    <li key={c.value}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border)] px-3 py-2 hover:bg-[var(--bg-secondary)]">
                        <input
                          type="radio"
                          name="ipi"
                          className="mt-1"
                          checked={ipi === c.value}
                          onChange={() => setIpi(c.value)}
                        />
                        <span>
                          <span className="font-mono font-medium text-[var(--text-primary)]">{c.value}</span>
                          <span className="mt-0.5 block font-mono text-[10px] text-[var(--text-muted)]">
                            {c.votes} szavazat · {c.sources.join(", ")}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">Nincs IPI jelölt a sorokban.</p>
              )}
              <label className="block text-sm">
                <span className="text-[var(--text-secondary)]">Kézi IPI</span>
                <input
                  type="text"
                  value={ipi}
                  onChange={(e) => setIpi(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-[var(--text-primary)]"
                  placeholder="00518140870"
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStep(steps[stepIndex - 1] ?? "exclude")}
            className="text-sm font-semibold text-[var(--text-secondary)] disabled:opacity-40"
          >
            Vissza
          </button>
          <div className="flex items-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" /> : null}
            {step !== "ipi" ? (
              <button
                type="button"
                onClick={() => setStep(steps[stepIndex + 1] ?? "ipi")}
                className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white"
              >
                Tovább
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleFinish()}
                className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {storageAvailable ? "Mentés és lezárás" : "Bezárás"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
