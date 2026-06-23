"use client";

import { useRef, useState } from "react";
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
import { SESSION_STORAGE_KEY, isSyntheticAuditIsrc } from "@/lib/types";
import { validateIsrc } from "@/lib/isrc-validator";
import { catalogEnrichProfile, countRealIsrcs } from "@/lib/audit-core/enrich-profile";
import { planEnrichLegs, type EnrichLegId } from "@/lib/audit-core/enrich-plan";
import { mergeAuditRowsPreservingEnrich } from "@/lib/artist-audit-rows-merge";
import { buildAuditRows, buildAuditSummary } from "@/lib/audit-engine";
import { applyArtisjusEnrichment } from "@/lib/artisjus-enrich";
import type { ArtisjusWork } from "@/lib/artisjus-types";
import { ArtistAuditResults } from "@/components/ArtistAuditResults";
import { ArtistNameAuditForm } from "@/components/ArtistNameAuditForm";
import { ArtistSearchCombobox } from "@/components/ArtistSearchCombobox";
import { AUDIT_CATALOG_ENRICH_LOADING_MESSAGE, AUDIT_HERO_SUBTITLE, AUDIT_HERO_TITLE } from "@/lib/audit-source-labels";
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
  const [mlcBusy, setMlcBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [lastReportId, setLastReportId] = useState<string | null>(null);

  const [singleTrackBusy, setSingleTrackBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const auditAbortRef = useRef<AbortController | null>(null);
  const auditRunIdRef = useRef(0);
  const enrichChainRef = useRef<Promise<void>>(Promise.resolve());

  function cancelInFlightAudit() {
    auditAbortRef.current?.abort();
    auditAbortRef.current = null;
    auditRunIdRef.current += 1;
  }

  function isAuditRunStale(runId: number) {
    return runId !== auditRunIdRef.current;
  }

  function isAbortError(err: unknown): boolean {
    return err instanceof DOMException && err.name === "AbortError";
  }

  function clearArtist() {
    cancelInFlightAudit();
    setResolvedArtistId(null);
    setResolvedArtistName(null);
    setAuditRows(null);
    setAuditSummary(null);
    setAuditMeta(null);
    setPublishedUrl(null);
    setLastReportId(null);
    setResolveError(null);
    setSpotifyUrl("");
    setMlcBusy(false);
    setEnrichBusy(false);
  }

  async function postCatalogEnrichLeg(
    rows: AuditRow[],
    leg: EnrichLegId,
    artistName: string,
    spotifyArtistId: string | null,
    _signal: AbortSignal,
  ) {
    const res = await fetch("/api/artist-audit/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows,
        artistName,
        spotifyArtistId: spotifyArtistId ?? undefined,
        leg,
      }),
    });
    const data = (await res.json()) as {
      rows?: AuditRow[];
      summary?: AuditSummary;
      meta?: Partial<ArtistAuditMeta>;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? `Metaadat enrich (${leg}) sikertelen.`);
    }
    return data;
  }

  async function postCatalogEnrich(
    rows: AuditRow[],
    artistName: string,
    spotifyArtistId: string | null,
    signal: AbortSignal,
  ) {
    const res = await fetch("/api/artist-audit/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rows,
        artistName,
        spotifyArtistId: spotifyArtistId ?? undefined,
      }),
      signal,
    });
    const data = (await res.json()) as {
      rows?: AuditRow[];
      summary?: AuditSummary;
      meta?: Partial<ArtistAuditMeta>;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "Metaadat enrich sikertelen.");
    }
    return data;
  }

  async function runCatalogEnrichIfNeeded(
    rows: AuditRow[],
    artistName: string,
    spotifyArtistId: string | null,
    runId: number,
    signal: AbortSignal,
  ) {
    const hasIsrc = rows.some((r) => r.isrc?.trim() && !isSyntheticAuditIsrc(r.isrc));
    const hasTitles = rows.some((r) => r.title?.trim());
    if (!hasIsrc && !hasTitles) {
      setAuditMeta((prev) =>
        prev
          ? { ...prev, catalogEnrichSkipReason: "no_isrc", catalogEnrichReady: false }
          : prev,
      );
      return;
    }

    const task = async () => {
      if (isAuditRunStale(runId)) return;
      const profile = catalogEnrichProfile(rows);
      const plan = planEnrichLegs(profile);
      const legsDone: string[] = [];

      setAuditMeta((prev) =>
        prev
          ? {
              ...prev,
              catalogEnrichReady: false,
              catalogEnrichProfile: profile,
              catalogEnrichLegsDone: [],
              catalogEnrichLegBusy: null,
            }
          : prev,
      );
      setEnrichBusy(true);

      let currentRows = rows;

      const applyLegResult = (leg: EnrichLegId, enriched: Awaited<ReturnType<typeof postCatalogEnrichLeg>>) => {
        if (isAuditRunStale(runId)) return;
        currentRows = enriched.rows ?? currentRows;
        setAuditRows((prev) => mergeAuditRowsPreservingEnrich(prev, currentRows));
        if (enriched.summary) setAuditSummary(enriched.summary);
        legsDone.push(leg);
        setAuditMeta((prev) =>
          prev && enriched.meta
            ? {
                ...prev,
                ...enriched.meta,
                catalogEnrichSkipReason: undefined,
                catalogEnrichLegsDone: [...legsDone],
                catalogEnrichLegBusy: null,
              }
            : prev,
        );
      };

      try {
        for (const leg of plan.blocking) {
          if (isAuditRunStale(runId)) return;
          setAuditMeta((prev) => (prev ? { ...prev, catalogEnrichLegBusy: leg } : prev));
          const enriched = await postCatalogEnrichLeg(
            currentRows,
            leg,
            artistName,
            spotifyArtistId,
            signal,
          );
          applyLegResult(leg, enriched);
        }

        setAuditMeta((prev) => (prev ? { ...prev, catalogEnrichReady: true, catalogEnrichLegBusy: null } : prev));
        setEnrichBusy(false);

        for (const leg of plan.background) {
          if (isAuditRunStale(runId)) return;
          setAuditMeta((prev) => (prev ? { ...prev, catalogEnrichLegBusy: leg } : prev));
          try {
            const enriched = await postCatalogEnrichLeg(
              currentRows,
              leg,
              artistName,
              spotifyArtistId,
              signal,
            );
            applyLegResult(leg, enriched);
          } catch (bgErr) {
            if (isAbortError(bgErr) || isAuditRunStale(runId)) return;
            console.warn(`[enrich] background leg ${leg} failed:`, bgErr);
            setAuditMeta((prev) =>
              prev
                ? {
                    ...prev,
                    catalogEnrichLegBusy: null,
                    catalogEnrichCisacCatalogWorks: prev.catalogEnrichCisacCatalogWorks ?? 0,
                  }
                : prev,
            );
          }
        }
      } catch (err) {
        if (isAbortError(err) || isAuditRunStale(runId)) return;
        const msg = err instanceof Error ? err.message : "Metaadat enrich sikertelen.";
        setResolveError(`${msg} A black box találatok megmaradtak.`);
        setEnrichBusy(false);
        setAuditMeta((prev) => (prev ? { ...prev, catalogEnrichLegBusy: null } : prev));
      }
    };

    enrichChainRef.current = enrichChainRef.current.then(task).catch(() => {});
    await enrichChainRef.current;
  }

  /** Re-run CISAC leg after identity wizard saves IPI (enrich at audit time may have skipped). */
  async function runCisacEnrichAfterIdentity(
    rows: AuditRow[],
    artistName: string,
    spotifyArtistId: string | null,
  ) {
    const runId = auditRunIdRef.current;
    const signal = auditAbortRef.current?.signal ?? new AbortController().signal;

    setAuditMeta((prev) =>
      prev ? { ...prev, catalogEnrichLegBusy: "cisac" } : prev,
    );
    setEnrichBusy(true);
    try {
      const enriched = await postCatalogEnrichLeg(
        rows,
        "cisac",
        artistName,
        spotifyArtistId,
        signal,
      );
      if (isAuditRunStale(runId)) return;
      setAuditRows((prev) => mergeAuditRowsPreservingEnrich(prev, enriched.rows ?? rows));
      if (enriched.summary) setAuditSummary(enriched.summary);
      setAuditMeta((prev) => {
        if (!prev || !enriched.meta) return prev;
        const legsDone = [...(prev.catalogEnrichLegsDone ?? [])];
        if (!legsDone.includes("cisac")) legsDone.push("cisac");
        return {
          ...prev,
          ...enriched.meta,
          catalogEnrichReady: true,
          catalogEnrichLegBusy: null,
          catalogEnrichLegsDone: legsDone,
        };
      });
    } catch (err) {
      if (isAbortError(err) || isAuditRunStale(runId)) return;
      const msg = err instanceof Error ? err.message : "CISAC enrich sikertelen.";
      setResolveError(`${msg} Az IPI mentve — próbáld újra pár perc múlva.`);
    } finally {
      if (!isAuditRunStale(runId)) {
        setEnrichBusy(false);
        setAuditMeta((prev) => (prev ? { ...prev, catalogEnrichLegBusy: null } : prev));
      }
    }
  }

  async function postArtistAuditMlc(
    artistName: string,
    scope: "top15" | "full",
    signal: AbortSignal,
  ) {
    const res = await fetch("/api/artist-audit/mlc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistName, scope }),
      signal,
    });
    const data = (await res.json()) as {
      rows?: AuditRow[];
      summary?: AuditSummary;
      meta?: ArtistAuditMeta;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "MLC lekérdezés sikertelen.");
    }
    return data;
  }

  async function runMlcBackground(
    artistName: string,
    artistId: string,
    scope: "top15" | "full",
    runId: number,
    signal: AbortSignal,
  ) {
    setMlcBusy(true);
    try {
      const full = await postArtistAuditMlc(artistName, scope, signal);
      if (isAuditRunStale(runId)) return;

      let mergedRows: AuditRow[] = [];
      setAuditRows((prev) => {
        mergedRows = mergeAuditRowsPreservingEnrich(prev, full.rows ?? []);
        return mergedRows;
      });
      if (full.summary) setAuditSummary(full.summary);
      setAuditMeta((prev) =>
        full.meta
          ? { ...prev, ...full.meta, mlcPending: false }
          : prev
            ? { ...prev, mlcPending: false }
            : prev,
      );

      await runCatalogEnrichIfNeeded(mergedRows, artistName, artistId, runId, signal);
    } catch (err) {
      if (isAbortError(err) || isAuditRunStale(runId)) return;
      const msg = err instanceof Error ? err.message : "MLC lekérdezés sikertelen.";
      setResolveError(`${msg} A magyar/európai találatok megmaradtak.`);
    } finally {
      if (!isAuditRunStale(runId)) setMlcBusy(false);
    }
  }

  async function postArtistAudit(
    artistName: string,
    scope: "top15" | "full",
    mlc: "wait" | "skip" | "only",
    signal: AbortSignal,
  ) {
    const res = await fetch("/api/artist-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistName, scope, mlc }),
      signal,
    });
    const data = (await res.json()) as {
      rows?: AuditRow[];
      summary?: AuditSummary;
      meta?: ArtistAuditMeta;
      error?: string;
    };
    if (!res.ok) {
      throw new Error(data.error ?? "Az ellenőrzés nem sikerült.");
    }
    return data;
  }

  async function runArtistAudit(artistId: string, artistName: string, scope: "top15" | "full") {
    cancelInFlightAudit();
    const runId = auditRunIdRef.current;
    const controller = new AbortController();
    auditAbortRef.current = controller;
    const { signal } = controller;

    if (scope === "top15") {
      setResolveStatus("loading");
      setResolveError(null);
      setAuditRows(null);
      setAuditSummary(null);
      setAuditMeta(null);
      setMlcBusy(false);
      setEnrichBusy(false);
    } else {
      setCatalogBusy(true);
      setResolveError(null);
    }

    setResolvedArtistId(artistId);
    setResolvedArtistName(artistName);

    try {
      const fast = await postArtistAudit(artistName, scope, "skip", signal);
      if (isAuditRunStale(runId)) return;

      setAuditRows(fast.rows ?? []);
      setAuditSummary(fast.summary ?? null);
      setAuditMeta(fast.meta ?? null);
      setResolveStatus("idle");
      setCatalogBusy(false);

      const deferEnrichForMlc =
        fast.meta?.mlcPending && countRealIsrcs(fast.rows ?? []) > 0;

      if (deferEnrichForMlc) {
        void runMlcBackground(artistName, artistId, scope, runId, signal);
      } else {
        void runCatalogEnrichIfNeeded(fast.rows ?? [], artistName, artistId, runId, signal);
      }
    } catch (err) {
      if (isAbortError(err) || isAuditRunStale(runId)) return;
      setResolveError(err instanceof Error ? err.message : "Hálózati hiba az ellenőrzés közben.");
      if (scope === "top15") clearArtist();
    } finally {
      if (!isAuditRunStale(runId)) {
        if (scope === "top15") setResolveStatus("idle");
        setCatalogBusy(false);
      }
    }
  }

  function activateArtistByName(artistName: string) {
    void (async () => {
      let artistId = "";
      try {
        const res = await fetch(`/api/search-artists?q=${encodeURIComponent(artistName)}`);
        const data = (await res.json()) as { artists?: { spotifyId: string }[] };
        artistId = data.artists?.[0]?.spotifyId ?? "";
      } catch {
        /* audit without Spotify id — enrich will try name resolve server-side */
      }
      await runArtistAudit(artistId, artistName, "top15");
    })();
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

  async function publishReport(selectedRows: AuditRow[]) {
    if (!auditSummary || !auditMeta || !resolvedArtistName || selectedRows.length === 0) return;
    setPublishBusy(true);
    setResolveError(null);
    try {
      const res = await fetch("/api/reports/publish-from-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistName: resolvedArtistName,
          scope: auditMeta.scope,
          rows: selectedRows,
          summary: auditSummary,
          meta: auditMeta,
          problemsOnly: true,
          supersedesReportId: lastReportId,
        }),
      });
      const data = (await res.json()) as { url?: string; reportId?: string; error?: string };
      if (!res.ok) {
        setResolveError(data.error ?? "Közzététel sikertelen.");
        return;
      }
      if (data.url) setPublishedUrl(data.url);
      if (data.reportId) setLastReportId(data.reportId);
    } catch {
      setResolveError("Hálózati hiba a közzététel közben.");
    } finally {
      setPublishBusy(false);
    }
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

  const showSearch = !resolvedArtistName;

  return (
    <div className={`mx-auto w-full px-4 pb-20 pt-8 md:px-6 md:pt-12 ${resolvedArtistName ? "max-w-7xl" : "max-w-3xl"}`}>
      {showSearch ? (
        <div className="mx-auto max-w-xl text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--text-muted)]">
            BBOX AUDIT
          </p>
          <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl">
            {AUDIT_HERO_TITLE}
          </h1>
          <p className="mt-4 text-pretty text-base leading-relaxed text-[var(--text-secondary)]">
            {AUDIT_HERO_SUBTITLE}
          </p>
        </div>
      ) : null}

      <div className={`space-y-5 ${showSearch ? "mx-auto mt-10 max-w-xl" : "mt-2"}`}>
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
                      className="input-bbox w-full px-3.5 py-2.5"
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
            spotifyId={resolvedArtistId}
            loading={resolveStatus === "loading"}
            rows={auditRows}
            summary={auditSummary}
            meta={auditMeta}
            catalogBusy={catalogBusy}
            mlcBusy={mlcBusy}
            enrichBusy={enrichBusy}
            onIdentitySaved={(saved) => {
              if (!auditRows || !resolvedArtistName || !saved.ipi?.trim()) return;
              void runCisacEnrichAfterIdentity(
                auditRows,
                resolvedArtistName,
                resolvedArtistId,
              );
            }}
            onLoadFullCatalog={loadFullCatalog}
            onOpenReport={openReport}
            onPublish={(rows) => void publishReport(rows)}
            publishBusy={publishBusy}
            publishedUrl={publishedUrl}
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
