"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type {
  ArtistAuditMeta,
  AuditRow,
  AuditSummary,
  BatchResult,
  ShareAuditResult,
  StoredAuditPayload,
  UnmatchedAuditResult,
} from "@/lib/types";
import { SESSION_STORAGE_KEY } from "@/lib/types";
import { validateIsrc } from "@/lib/isrc-validator";
import { buildAuditRows, buildAuditSummary } from "@/lib/audit-engine";
import { applyArtisjusEnrichment } from "@/lib/artisjus-enrich";
import type { ArtisjusWork } from "@/lib/artisjus-types";
import { ArtistAuditResults } from "@/components/ArtistAuditResults";
import { ArtistNameAuditForm } from "@/components/ArtistNameAuditForm";
import { ArtistSearchCombobox } from "@/components/ArtistSearchCombobox";
import { AUDIT_HERO_SUBTITLE, AUDIT_HERO_TITLE } from "@/lib/audit-source-labels";
import { TrackSearchCombobox } from "@/components/TrackSearchCombobox";

export function HomeAuditor() {
  const router = useRouter();
  const [spotifyUrl, setSpotifyUrl] = useState("");
  const [resolveStatus, setResolveStatus] = useState<"idle" | "loading">("idle");
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [resolvedArtistId, setResolvedArtistId] = useState<string | null>(null);
  const [resolvedArtistName, setResolvedArtistName] = useState<string | null>(null);
  const [auditRows, setAuditRows] = useState<AuditRow[] | null>(null);
  const [auditSummary, setAuditSummary] = useState<AuditSummary | null>(null);
  const [auditMeta, setAuditMeta] = useState<ArtistAuditMeta | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);

  const [singleTrackBusy, setSingleTrackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function clearArtist() {
    setResolvedArtistId(null);
    setResolvedArtistName(null);
    setAuditRows(null);
    setAuditSummary(null);
    setAuditMeta(null);
    setResolveError(null);
    setSpotifyUrl("");
  }

  async function runArtistAudit(artistId: string, artistName: string, scope: "top15" | "full") {
    if (scope === "top15") {
      setResolveStatus("loading");
      setResolveError(null);
      setAuditRows(null);
      setAuditSummary(null);
      setAuditMeta(null);
    } else {
      setCatalogBusy(true);
      setResolveError(null);
    }

    setResolvedArtistId(artistId);
    setResolvedArtistName(artistName);

    try {
      const res = await fetch("/api/artist-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId, artistName, scope }),
      });
      const data = (await res.json()) as {
        rows?: AuditRow[];
        summary?: AuditSummary;
        meta?: ArtistAuditMeta;
        error?: string;
      };
      if (!res.ok) {
        setResolveError(data.error ?? "Az ellenőrzés nem sikerült.");
        if (scope === "top15") clearArtist();
        return;
      }
      setAuditRows(data.rows ?? []);
      setAuditSummary(data.summary ?? null);
      setAuditMeta(data.meta ?? null);
    } catch {
      setResolveError("Hálózati hiba az ellenőrzés közben.");
      if (scope === "top15") clearArtist();
    } finally {
      setResolveStatus("idle");
      setCatalogBusy(false);
    }
  }

  function activateArtistByName(artistName: string) {
    void runArtistAudit("", artistName, "top15");
  }

  function activateArtist(artistId: string, artistName: string) {
    void runArtistAudit(artistId, artistName, "top15");
  }

  function loadFullCatalog() {
    if (!resolvedArtistName) return;
    void runArtistAudit(resolvedArtistId ?? "", resolvedArtistName, "full");
  }

  function openReport() {
    if (!auditRows || !auditSummary) return;
    const stored: StoredAuditPayload = {
      rows: auditRows,
      summary: auditSummary,
      generatedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored));
    router.push("/audit");
  }

  async function importSpotifyUrl() {
    const raw = spotifyUrl.trim();
    if (!raw) return;
    setResolveStatus("loading");
    setResolveError(null);
    clearArtist();
    try {
      const res = await fetch(`/api/spotify-resolve?url=${encodeURIComponent(raw)}`);
      const data = (await res.json()) as {
        mode?: string | null;
        tracks?: { isrc?: string | null }[];
        error?: string | null;
        artistId?: string;
        artistName?: string | null;
      };
      if (!res.ok) {
        setResolveError(data.error ?? "Nem sikerült feloldani ezt a linket.");
        return;
      }
      if (data.mode === "artist" && data.artistId) {
        setResolveStatus("idle");
        await runArtistAudit(data.artistId, data.artistName ?? "Előadó", "top15");
        setSpotifyUrl("");
        return;
      }
      if (data.mode === "track" && data.tracks?.[0]?.isrc) {
        setResolveStatus("idle");
        await auditSingleIsrc(data.tracks[0].isrc);
        setSpotifyUrl("");
        return;
      }
      setResolveError("Csak előadó vagy dal link támogatott.");
    } catch {
      setResolveError("Hálózati hiba a link feloldása közben.");
    } finally {
      setResolveStatus("idle");
    }
  }

  async function auditSingleIsrc(isrcRaw: string) {
    const { valid, normalized } = validateIsrc(isrcRaw);
    if (!valid) {
      setError(`Érvénytelen ISRC: ${isrcRaw}`);
      return;
    }
    setSingleTrackBusy(true);
    setError(null);
    clearArtist();
    try {
      const payload = JSON.stringify({ isrcs: [normalized] });
      const [batchRes, shareRes, unmatchedRes] = await Promise.all([
        fetch("/api/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }),
        fetch("/api/audit-shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }),
        fetch("/api/audit-unmatched", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }),
      ]);
      const batchJson = (await batchRes.json()) as { results?: BatchResult[] };
      const shareJson = (await shareRes.json()) as { results?: ShareAuditResult[] };
      const unmatchedJson = (await unmatchedRes.json()) as { results?: UnmatchedAuditResult[] };
      if (!batchRes.ok || !shareRes.ok || !unmatchedRes.ok) {
        throw new Error("API hiba");
      }
      let rows = buildAuditRows(batchJson.results ?? [], shareJson.results ?? [], unmatchedJson.results ?? []);
      try {
        const artRes = await fetch("/api/artisjus-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tracks: rows.map((r) => ({ isrc: r.isrc, title: r.title, artist: r.artist })),
          }),
        });
        const artJson = (await artRes.json()) as {
          matches?: Array<{ isrc: string; matched: boolean; score: number; work?: ArtisjusWork }>;
        };
        if (artRes.ok && artJson.matches) {
          rows = applyArtisjusEnrichment(rows, artJson.matches);
        }
      } catch {
        /* optional */
      }
      const summary = buildAuditSummary(rows);
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({ rows, summary, generatedAt: new Date().toISOString() } satisfies StoredAuditPayload),
      );
      router.push("/audit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hiba");
    } finally {
      setSingleTrackBusy(false);
    }
  }

  const showSearch = !resolvedArtistName || resolveStatus === "loading";

  return (
    <div className="mx-auto w-full max-w-5xl px-6 pb-20 pt-10 md:pt-14">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
          BBOX AUDIT
        </p>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl md:leading-[1.15]">
          {AUDIT_HERO_TITLE}
        </h1>
        <p className="mt-5 text-pretty text-base leading-relaxed text-[var(--text-secondary)]">
          {AUDIT_HERO_SUBTITLE}
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-xl space-y-5">
        {showSearch ? (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-6 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.06)] md:px-8">
            <ArtistNameAuditForm
              disabled={resolveStatus === "loading" || singleTrackBusy}
              busy={resolveStatus === "loading"}
              onAudit={activateArtistByName}
            />

            <details className="group mt-6 rounded-[10px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
                Spotify kereső (opcionális — pontosításhoz)
              </summary>
              <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
                <ArtistSearchCombobox
                  disabled={resolveStatus === "loading" || singleTrackBusy}
                  onPick={(hit) => activateArtist(hit.spotifyId, hit.name)}
                />
              </div>
            </details>

            <details className="group mt-3 rounded-[10px] border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
                Egy dal, vagy Spotify-link
              </summary>
              <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
                <TrackSearchCombobox
                  onPick={(hit) => {
                    if (hit.isrc) void auditSingleIsrc(hit.isrc);
                  }}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <input
                      type="url"
                      value={spotifyUrl}
                      onChange={(e) => setSpotifyUrl(e.target.value)}
                      placeholder="open.spotify.com/artist/…"
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
                    className="shrink-0 rounded-[10px] border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm font-semibold disabled:opacity-40"
                  >
                    Betöltés
                  </button>
                </div>
              </div>
            </details>
          </div>
        ) : null}

        {resolveError ? (
          <p className="text-sm text-[var(--accent-critical)]" role="alert">
            {resolveError}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-[var(--accent-critical)]" role="alert">
            {error}
          </p>
        ) : null}

        {singleTrackBusy ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[var(--text-secondary)]">
            <Loader2 className="size-5 animate-spin" aria-hidden />
            Dal ellenőrzése…
          </div>
        ) : null}

        {resolvedArtistName ? (
          <ArtistAuditResults
            artistName={resolvedArtistName}
            loading={resolveStatus === "loading"}
            rows={auditRows}
            summary={auditSummary}
            meta={auditMeta}
            catalogBusy={catalogBusy}
            onLoadFullCatalog={loadFullCatalog}
            onOpenReport={openReport}
            onClearArtist={clearArtist}
          />
        ) : null}

        <p className="text-center">
          <Link
            href="/audit"
            className="text-sm font-medium text-[var(--text-secondary)] underline-offset-4 hover:text-[var(--accent-primary)] hover:underline"
          >
            Korábbi jelentés megnyitása
          </Link>
        </p>
      </div>
    </div>
  );
}
