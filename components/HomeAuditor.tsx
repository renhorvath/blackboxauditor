"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Music2, Plus, X } from "lucide-react";
import type {
  BatchResult,
  SearchTrackHit,
  ShareAuditResult,
  StoredAuditPayload,
  UnmatchedAuditResult,
} from "@/lib/types";
import { SESSION_STORAGE_KEY } from "@/lib/types";
import { validateIsrc } from "@/lib/isrc-validator";
import { buildAuditRows, buildAuditSummary } from "@/lib/audit-engine";
import { TrackSearchCombobox } from "@/components/TrackSearchCombobox";

type SelectedTrack = SearchTrackHit & { normalizedIsrc: string };

export function HomeAuditor() {
  const router = useRouter();
  const [selected, setSelected] = useState<SelectedTrack[]>([]);
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [resolveStatus, setResolveStatus] = useState<"idle" | "loading">("idle");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [artistPickList, setArtistPickList] = useState<SearchTrackHit[] | null>(null);

  const [status, setStatus] = useState<"idle" | "fetching">("idle");
  const [error, setError] = useState<string | null>(null);

  const canRun = selected.length > 0 && status !== "fetching";

  function addHit(hit: SearchTrackHit) {
    if (!hit.isrc) return;
    const { valid, normalized } = validateIsrc(hit.isrc);
    if (!valid) {
      setError(`Érvénytelen ISRC a Spotify válaszában: ${hit.isrc}`);
      return;
    }
    setError(null);
    setSelected((prev) => {
      if (prev.some((p) => p.normalizedIsrc === normalized)) return prev;
      return [...prev, { ...hit, normalizedIsrc: normalized }];
    });
  }

  function removeIsrc(isrc: string) {
    setSelected((prev) => prev.filter((p) => p.normalizedIsrc !== isrc));
  }

  async function importSpotifyUrl() {
    const raw = spotifyUrl.trim();
    if (!raw) return;
    setResolveStatus("loading");
    setResolveError(null);
    setArtistPickList(null);
    try {
      const res = await fetch(`/api/spotify-resolve?url=${encodeURIComponent(raw)}`);
      const data = (await res.json()) as {
        mode?: string | null;
        tracks?: SearchTrackHit[];
        error?: string | null;
      };
      if (!res.ok) {
        setResolveError(data.error ?? "Nem sikerült feloldani ezt a linket.");
        return;
      }
      const tracks = data.tracks ?? [];
      if (data.mode === "track" && tracks[0]) {
        addHit(tracks[0]);
        setSpotifyUrl("");
        return;
      }
      if (data.mode === "artist") {
        setArtistPickList(tracks);
        if (tracks.length === 0) {
          setResolveError("Ehhez az előadóhoz nem érkeztek top dalok.");
        }
        return;
      }
      setResolveError("Váratlan válasz a Spotify feloldótól.");
    } catch {
      setResolveError("Hálózati hiba a link feloldása közben.");
    } finally {
      setResolveStatus("idle");
    }
  }

  function addAllWithIsrc() {
    if (!artistPickList) return;
    for (const t of artistPickList) {
      if (t.isrc) addHit(t);
    }
    setArtistPickList(null);
    setSpotifyUrl("");
  }

  async function runAudit() {
    const isrcs = [...new Set(selected.map((s) => s.normalizedIsrc))];
    if (isrcs.length === 0) return;

    setStatus("fetching");
    setError(null);

    try {
      const payload = JSON.stringify({ isrcs });

      const [batchRes, shareRes, unmatchedRes] = await Promise.all([
        fetch("/api/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        }),
        fetch("/api/audit-shares", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        }),
        fetch("/api/audit-unmatched", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        }),
      ]);

      const batchJson = (await batchRes.json()) as {
        results?: BatchResult[];
        error?: string;
      };
      const shareJson = (await shareRes.json()) as {
        results?: ShareAuditResult[];
        error?: string;
      };
      const unmatchedJson = (await unmatchedRes.json()) as {
        results?: UnmatchedAuditResult[];
        error?: string;
      };

      if (!batchRes.ok) throw new Error(batchJson.error ?? "Batch API hiba");
      if (!shareRes.ok) throw new Error(shareJson.error ?? "Shares API hiba");
      if (!unmatchedRes.ok) throw new Error(unmatchedJson.error ?? "Unmatched API hiba");

      const rows = buildAuditRows(
        batchJson.results ?? [],
        shareJson.results ?? [],
        unmatchedJson.results ?? [],
      );
      const summary = buildAuditSummary(rows);

      const stored: StoredAuditPayload = {
        rows,
        summary,
        generatedAt: new Date().toISOString(),
      };
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
      router.push("/audit");
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Ismeretlen hiba történt az audit során.";
      setError(msg);
    } finally {
      setStatus("idle");
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-20 pt-10 md:pt-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
          BBOX AUDIT
        </p>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl md:leading-[1.15]">
          Nézd meg, hogy a felvételeid adatai rendben vannak-e
        </h1>
        <p className="mt-5 text-pretty text-base leading-relaxed text-[var(--text-secondary)]">
          Keress előadóra vagy dalra, vagy illessz be egy Spotify-linket. Megmutatjuk, kik szerepelnek a
          nyilvántartásokban szerzőként és kiadóként, és hogy az adatlánc teljes-e — mert egy hiányzó láncszem
          miatt a jogdíj könnyen elvész útközben. Ha valami nincs rendben, konkrét teendőket kapsz, sorban.
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-xl rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-6 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:px-8">
        <div className="space-y-5">
          <TrackSearchCombobox onPick={addHit} />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                Spotify link
              </label>
              <input
                type="url"
                value={spotifyUrl}
                onChange={(e) => setSpotifyUrl(e.target.value)}
                placeholder="Vagy illessz be Spotify track / előadó URL-t"
                className="input-bbox w-full"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void importSpotifyUrl();
                }}
              />
            </div>
            <button
              type="button"
              disabled={resolveStatus === "loading" || !spotifyUrl.trim()}
              onClick={() => void importSpotifyUrl()}
              className="shrink-0 rounded-[10px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {resolveStatus === "loading" ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Betöltés…
                </span>
              ) : (
                "Betöltés"
              )}
            </button>
          </div>

          {resolveError ? (
            <p className="text-sm text-[var(--accent-critical)]" role="alert">
              {resolveError}
            </p>
          ) : null}

          {artistPickList && artistPickList.length > 0 ? (
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  Top dalok — a + jellel sorba teszed az ISRC-ket
                </p>
                <button
                  type="button"
                  onClick={addAllWithIsrc}
                  className="text-xs font-semibold text-[var(--accent-primary)] underline-offset-2 hover:underline"
                >
                  Összes ISRC-s sor hozzáadása
                </button>
              </div>
              <ul className="max-h-52 space-y-1 overflow-auto">
                {artistPickList.map((hit) => {
                  const noIsrc = !hit.isrc;
                  return (
                    <li
                      key={hit.spotifyId}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--bg-primary)]"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{hit.title}</p>
                        <p className="truncate text-xs text-[var(--text-muted)]">{hit.artists.join(", ")}</p>
                      </div>
                      <button
                        type="button"
                        disabled={noIsrc}
                        title={
                          noIsrc
                            ? "Ehhez a Spotify sorhoz nem tartozik ISRC."
                            : "Hozzáadás a sorhoz"
                        }
                        onClick={() => !noIsrc && addHit(hit)}
                        className="shrink-0 rounded-lg p-2 text-[var(--accent-primary)] hover:bg-[color-mix(in_srgb,var(--accent-primary)_12%,transparent)] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-[var(--border)] pt-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Sor ({selected.length})
              </h2>
              {selected.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setSelected([])}
                  className="text-xs font-semibold text-[var(--accent-primary)] underline-offset-2 hover:underline"
                >
                  Összes törlése
                </button>
              ) : null}
            </div>

            {selected.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                Még nincs felvétel a sorban — keress felül, vagy tölts be Spotify linket.
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-2 overflow-auto">
                {selected.map((s) => (
                  <li
                    key={s.normalizedIsrc}
                    className="flex items-start justify-between gap-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2.5"
                  >
                    <div className="flex min-w-0 gap-2.5">
                      <Music2 className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--text-primary)]">{s.title}</p>
                        <p className="truncate text-xs text-[var(--text-secondary)]">
                          {s.artists.join(", ")}
                          {s.album ? ` · ${s.album}` : ""}
                        </p>
                        <p className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">{s.normalizedIsrc}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="Eltávolítás"
                      onClick={() => removeIsrc(s.normalizedIsrc)}
                      className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {error ? (
            <p className="text-sm text-[var(--accent-critical)]" role="alert">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!canRun}
            onClick={() => void runAudit()}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] bg-[var(--accent-primary)] py-3.5 text-base font-semibold text-white shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {status === "fetching" ? (
              <>
                <Loader2 className="size-5 animate-spin" aria-hidden />
                Audit fut…
              </>
            ) : (
              "Audit kérése"
            )}
          </button>

          <p className="text-center">
            <Link
              href="/audit"
              className="text-sm font-medium text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--accent-primary)] hover:underline"
            >
              Korábbi eredmények (ugyanabban a böngészőlapon)
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
