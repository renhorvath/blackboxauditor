"use client";

import { useMemo, useState } from "react";
import {
  EJI_ADATLAP_COLUMNS,
  EJI_CLASSICAL_RULES,
  EJI_MULTI_PERFORMER_RULES,
  EJI_TEMPLATE_VERSION,
  type EjiAdatlapRow,
} from "@/lib/eji/adatlap-schema";
import type { EjiPocBundle } from "@/lib/eji/build-poc-bundle";
import { parseSpotifyArtistRef } from "@/lib/spotify-resolve";

export function EjiPocDemo() {
  const [query, setQuery] = useState("");
  const [submitter, setSubmitter] = useState("");
  /** Opcionális: open.spotify.com/artist/…, spotify:artist:…, vagy 22-char ID */
  const [catalogArtistRef, setCatalogArtistRef] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<EjiPocBundle | null>(null);
  const [spotifyArtistId, setSpotifyArtistId] = useState<string | null>(null);
  /** EJI találatok vs teljes összeállítás (EJI + Spotify extra) */
  const [scope, setScope] = useState<"eji" | "all">("eji");
  const [quality, setQuality] = useState<"all" | "fillable" | "review">("all");

  function resolveArtistId(override?: string | null): string | null {
    if (override) return override;
    if (spotifyArtistId) return spotifyArtistId;
    return (
      parseSpotifyArtistRef(catalogArtistRef) ||
      parseSpotifyArtistRef(query) ||
      null
    );
  }

  async function run(overrideSpotifyId?: string | null) {
    const sid = resolveArtistId(overrideSpotifyId);
    const q = query.trim();
    if (q.length < 2 && !sid) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        q: q || sid || "",
        submitter: submitter.trim() || q,
      });
      if (sid) params.set("spotifyArtistId", sid);
      const res = await fetch(`/api/demo/eji-poc?${params}`);
      const body = (await res.json()) as EjiPocBundle & { error?: string };
      if (!res.ok) throw new Error(body.error || "PoC hiba");
      setBundle(body);
      if (body.spotifyArtist?.id) {
        setSpotifyArtistId(body.spotifyArtist.id);
        if (body.spotifyArtistLocked && !catalogArtistRef.trim()) {
          setCatalogArtistRef(
            `https://open.spotify.com/artist/${body.spotifyArtist.id}`,
          );
        }
        if ((!q || parseSpotifyArtistRef(q)) && body.spotifyArtist.name) {
          setQuery(body.spotifyArtist.name);
        }
      }
      setScope("eji");
      setQuality("all");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hiba");
    } finally {
      setLoading(false);
    }
  }

  const scopedRows = useMemo(() => {
    if (!bundle) return [];
    if (scope === "eji") {
      return bundle.adatlapRows.filter((r) => r._meta.sources.includes("eji"));
    }
    return bundle.adatlapRows;
  }, [bundle, scope]);

  const rows = useMemo(() => {
    if (quality === "fillable") {
      return scopedRows.filter((r) => r._meta.missingRequired.length === 0);
    }
    if (quality === "review") {
      return scopedRows.filter((r) => r._meta.missingRequired.length > 0);
    }
    return scopedRows;
  }, [scopedRows, quality]);

  function rowsToCsv(list: EjiAdatlapRow[]): string {
    const headers = EJI_ADATLAP_COLUMNS.map((c) => c.header);
    const escape = (v: string) => {
      if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const lines = [headers.map(escape).join(",")];
    for (const row of list) {
      lines.push(
        EJI_ADATLAP_COLUMNS.map((c) => escape(row[c.key] ?? "")).join(","),
      );
    }
    return lines.join("\n");
  }

  function downloadCsv() {
    if (!bundle || rows.length === 0) return;
    const blob = new Blob([rowsToCsv(rows)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const tag = scope === "eji" ? "eji" : "osszes";
    a.download = `eji-adatlap-${tag}-${bundle.query.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="poc-root min-h-screen bg-[#0b0f14] text-[#e8eef4]">
      <div className="mx-auto max-w-7xl px-5 py-8">
        <header className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#7a8a9a]">
            Eastaste · EJI PoC · funkcionális demo
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
            EJI adatlap + A/B/C azonosítás
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-[#9aabbc] md:text-base">
            Hivatalos hangfelvételi sablon ({EJI_TEMPLATE_VERSION}) mezőire
            előtöltünk, amit kézi ellenőrzés után CSV / Excel formában feltölthetsz.
            Opcionális katalógus-előadó linkkel rögzítheted, melyik actről van szó.
          </p>
        </header>

        <form
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-[#243041] bg-[#121820] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(resolveArtistId(null));
          }}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-[#7a8a9a]">Előadó / zenekar</span>
              <input
                value={query}
                onChange={(e) => {
                  const v = e.target.value;
                  setQuery(v);
                  setBundle(null);
                  setError(null);
                  const fromName = parseSpotifyArtistRef(v);
                  if (fromName) {
                    setCatalogArtistRef(v.trim());
                    setSpotifyArtistId(fromName);
                  } else if (!catalogArtistRef.trim()) {
                    setSpotifyArtistId(null);
                  }
                }}
                className="w-full rounded-xl border border-[#243041] bg-[#0b0f14] px-3 py-2.5 outline-none focus:border-[#c4a574]"
                placeholder="Név, vagy katalógus előadó-link"
              />
            </label>
            <label className="flex-[1.2] text-sm">
              <span className="mb-1 block text-[#7a8a9a]">
                Katalógus előadó (opcionális)
              </span>
              <input
                value={catalogArtistRef}
                onChange={(e) => {
                  const v = e.target.value;
                  setCatalogArtistRef(v);
                  setBundle(null);
                  setError(null);
                  setSpotifyArtistId(parseSpotifyArtistRef(v));
                }}
                className="w-full rounded-xl border border-[#243041] bg-[#0b0f14] px-3 py-2.5 font-mono text-xs outline-none focus:border-[#c4a574]"
                placeholder="open.spotify.com/artist/… vagy ID"
              />
            </label>
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-[#7a8a9a]">
                Submitter (akit az adatlapra jelölünk)
              </span>
              <input
                value={submitter}
                onChange={(e) => setSubmitter(e.target.value)}
                className="w-full rounded-xl border border-[#243041] bg-[#0b0f14] px-3 py-2.5 outline-none focus:border-[#c4a574]"
                placeholder="Ugyanaz, vagy a bejelentő előadói neve"
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[#c4a574] px-5 py-2.5 text-sm font-semibold text-[#1a1208] disabled:opacity-50"
            >
              {loading ? "Összeállítás…" : "Összeállít"}
            </button>
          </div>
          {(spotifyArtistId || catalogArtistRef.trim()) && (
            <p className="font-mono text-[11px] text-[#7a8a9a]">
              Rögzített katalógus-ID:{" "}
              <span className="text-[#c4a574]">
                {spotifyArtistId ||
                  parseSpotifyArtistRef(catalogArtistRef) ||
                  "—"}
              </span>
              {spotifyArtistId && (
                <button
                  type="button"
                  className="ml-3 text-[#6ea8ff] underline-offset-2 hover:underline"
                  onClick={() => {
                    setSpotifyArtistId(null);
                    setCatalogArtistRef("");
                    setBundle(null);
                  }}
                >
                  törlés
                </button>
              )}
            </p>
          )}
        </form>

        {error && <p className="mb-4 text-sm text-[#e07a6a]">{error}</p>}
        {loading && (
          <p className="mb-4 font-mono text-xs text-[#6ea8ff]">
            Összeállítás…
          </p>
        )}

        {bundle && (
          <>
            {bundle.spotifyCandidates.length > 0 && (
              <div className="mb-4 rounded-2xl border border-[#243041] bg-[#121820] p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-[#c4a574]">
                  Katalógus előadó
                  {bundle.spotifyArtistLocked
                    ? " (rögzítve link/ID alapján)"
                    : bundle.spotifyAmbiguous
                      ? " (több találat — válassz)"
                      : " (választható)"}
                </p>
                <p className="mt-1 text-xs text-[#9aabbc]">
                  A hangfelvételi adatlap év/kiadó/ISRC pótlása ehhez az acthez
                  kötődik. Linkkel vagy kiválasztással rögzítheted.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bundle.spotifyCandidates.map((c) => {
                    const active = bundle.spotifyArtist?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setSpotifyArtistId(c.id);
                          setCatalogArtistRef(
                            `https://open.spotify.com/artist/${c.id}`,
                          );
                          void run(c.id);
                        }}
                        className={`max-w-xs rounded-xl border px-3 py-2 text-left text-xs ${
                          active
                            ? "border-[#c4a574] bg-[#c4a574]/15 text-[#e8eef4]"
                            : "border-[#243041] text-[#9aabbc] hover:border-[#c4a574]/60"
                        }`}
                      >
                        <div className="font-medium text-[#e8eef4]">
                          {c.name}
                          {c.locked ? " · rögzített" : ""}
                          {active && !c.locked ? " · kiválasztva" : ""}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#7a8a9a]">
                          {c.exactName ? "pontos név · " : ""}
                          {c.followers != null
                            ? `${c.followers.toLocaleString("hu-HU")} köv.`
                            : "—"}
                          {c.huIsrcCount != null
                            ? ` · HU ISRC ${c.huIsrcCount}`
                            : ""}
                          {c.genres[0] ? ` · ${c.genres[0]}` : ""}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {bundle.stats.spotifyWarning && (
              <p className="mb-4 rounded-xl border border-[#e07a6a]/40 bg-[#e07a6a]/10 px-4 py-3 text-sm text-[#e07a6a]">
                Katalógus hiányos — az EJI soroknál az év/kiadó pótlás gyengébb
                lehet. {bundle.stats.spotifyWarning}
              </p>
            )}

            <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="EJI sor" value={bundle.stats.ejiRows} />
              <Stat
                label="Katalógus extra"
                value={bundle.stats.catalogExtraRows}
              />
              <Stat
                label="Kitölthető (összes)"
                value={bundle.stats.templateFillable}
                tone="ok"
              />
              <Stat
                label="Külföldi UP"
                value={bundle.stats.foreignUp}
                tone={bundle.stats.foreignUp ? "warn" : undefined}
              />
            </section>

            <p className="mb-4 font-mono text-[11px] text-[#7a8a9a]">
              Sáv: {bundle.stats.isHuLane ? "A (HU)" : "C (külföldi)"} ·{" "}
              {bundle.stats.laneReason} · adatlap összesen{" "}
              {bundle.stats.adatlapTotal} (EJI {bundle.stats.ejiTracks} találat
              + katalógus extra)
            </p>

            <section className="mb-6 grid gap-4 lg:grid-cols-3">
              <LaneCard
                code="A"
                title={bundle.lanes.A.label}
                items={bundle.lanes.A.items}
                empty="HU act EJI adatlap-jelöltjei itt jelennek meg."
              />
              <LaneCard
                code="B"
                title={bundle.lanes.B.label}
                items={bundle.lanes.B.items.map((i) => ({
                  title: i.title,
                  detail: i.detail,
                }))}
                empty="Nincs neighbouring UP találat erre a névre."
              />
              <LaneCard
                code="C"
                title={bundle.lanes.C.label}
                items={bundle.lanes.C.items}
                empty="Külföldi act EJI-találatai / HU act artist-tab periodjai."
              />
            </section>

            <section className="mb-4 rounded-2xl border border-[#243041] bg-[#121820] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Hangfelvételi adatlap (sablon mezők)</h2>
                  <p className="mt-1 text-xs text-[#7a8a9a]">
                    Katalógus-előadó:{" "}
                    {bundle.spotifyArtist
                      ? bundle.spotifyArtist.name
                      : "—"}{" "}
                    · track: {bundle.stats.spotifyTracks}
                    {bundle.stats.mbEnriched
                      ? ` · meta+: ${bundle.stats.mbEnriched}`
                      : ""}
                    {bundle.stats.discogsConfigured && bundle.stats.discogsEnriched
                      ? ` · kiadó-pótlás: ${bundle.stats.discogsEnriched}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    className="rounded-lg border border-[#243041] px-3 py-1.5 text-xs hover:border-[#c4a574]"
                    href="/api/demo/eji-template"
                  >
                    Hivatalos .xls sablon
                  </a>
                  <a
                    className="rounded-lg border border-[#243041] px-3 py-1.5 text-xs hover:border-[#c4a574]"
                    href="/api/demo/eji-template?kind=classical"
                  >
                    Komolyzene PDF
                  </a>
                  <button
                    type="button"
                    onClick={downloadCsv}
                    className="rounded-lg bg-[#3dcea0] px-3 py-1.5 text-xs font-semibold text-[#062016]"
                  >
                    CSV (aktuális nézet · {rows.length})
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="self-center text-[10px] uppercase tracking-wider text-[#7a8a9a]">
                  Nézet
                </span>
                {(
                  [
                    ["eji", `Csak EJI (${bundle.stats.ejiRows})`],
                    [
                      "all",
                      `Minden megtalálható (${bundle.stats.adatlapTotal})`,
                    ],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setScope(k)}
                    className={`rounded-full px-3 py-1 ${
                      scope === k
                        ? "bg-[#c4a574] text-[#1a1208]"
                        : "border border-[#243041] text-[#9aabbc]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="self-center text-[10px] uppercase tracking-wider text-[#7a8a9a]">
                  Minőség
                </span>
                {(
                  [
                    ["all", `Összes (${scopedRows.length})`],
                    [
                      "fillable",
                      `Kitölthető (${scopedRows.filter((r) => r._meta.missingRequired.length === 0).length})`,
                    ],
                    [
                      "review",
                      `Hiányos (${scopedRows.filter((r) => r._meta.missingRequired.length > 0).length})`,
                    ],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setQuality(k)}
                    className={`rounded-full px-3 py-1 ${
                      quality === k
                        ? "bg-[#3dcea0]/20 text-[#3dcea0] ring-1 ring-[#3dcea0]/50"
                        : "border border-[#243041] text-[#9aabbc]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="mt-4 max-h-[480px] overflow-auto rounded-xl border border-[#243041]">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 bg-[#1a222d] font-mono text-[10px] uppercase text-[#7a8a9a]">
                    <tr>
                      <th className="px-2 py-2">Státusz</th>
                      {EJI_ADATLAP_COLUMNS.map((c) => (
                        <th key={c.key} className="px-2 py-2 whitespace-nowrap">
                          {c.key}
                        </th>
                      ))}
                      <th className="px-2 py-2">Forrás</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <Row key={`${r.title}-${i}`} row={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <Rules title="Több előadó / szerep" items={[...EJI_MULTI_PERFORMER_RULES]} />
              <Rules title="Komolyzene" items={[...EJI_CLASSICAL_RULES]} />
            </section>
          </>
        )}

        {!bundle && !loading && (
          <p className="text-sm text-[#7a8a9a]">
            Az összeállítás után itt jelennek meg az adatlap-jelöltek.
          </p>
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  const color =
    tone === "ok" ? "#3dcea0" : tone === "warn" ? "#e0b45c" : "#e8eef4";
  return (
    <div className="rounded-2xl border border-[#243041] bg-[#121820] p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[#7a8a9a]">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function LaneCard({
  code,
  title,
  items,
  empty,
}: {
  code: string;
  title: string;
  items: { title: string; detail: string }[];
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-[#243041] bg-[#121820] p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-[#c4a574]">
        Sáv {code}
      </p>
      <h3 className="mt-1 text-sm font-semibold leading-snug">{title}</h3>
      <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-xs">
        {items.length === 0 && <li className="text-[#7a8a9a]">{empty}</li>}
        {items.map((it, i) => (
          <li key={`${it.title}-${i}`} className="border-b border-[#243041]/40 pb-2">
            <div className="font-medium">{it.title}</div>
            <div className="text-[#7a8a9a]">{it.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatSources(sources: string[]): string {
  const map: Record<string, string> = {
    eji: "eji",
    spotify: "kat",
    discogs: "meta",
    musicbrainz: "meta",
    "pilot-sablon": "pilot",
  };
  return [...new Set(sources.map((s) => map[s] || s))].join("+");
}

function rowStatus(row: EjiAdatlapRow): {
  label: string;
  className: string;
} {
  const missing = row._meta.missingRequired;
  const rolesEmpty =
    !row.submitterRole &&
    !row.contribInstrumental &&
    !row.contribVocal &&
    !row.contribConductor;
  if (missing.length === 0 && !rolesEmpty) {
    return { label: "kitölthető", className: "text-[#3dcea0]" };
  }
  if (missing.length === 0 && rolesEmpty) {
    return {
      label: "szerep kézi",
      className: "text-[#6ea8ff]",
    };
  }
  return {
    label: `hiány: ${missing.join(",")}`,
    className: "text-[#e0b45c]",
  };
}

function Row({ row }: { row: EjiAdatlapRow }) {
  const status = rowStatus(row);
  const fromEji = row._meta.sources.includes("eji");
  const prov = row._meta.provenance;
  return (
    <tr className="border-t border-[#243041]/80 align-top hover:bg-[#1a222d]/60">
      <td className="px-2 py-2">
        <div className="mb-1 flex flex-wrap gap-1">
          <span
            className={
              fromEji
                ? "rounded bg-[#c4a574]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#c4a574]"
                : "rounded bg-[#6ea8ff]/15 px-1.5 py-0.5 font-mono text-[10px] text-[#6ea8ff]"
            }
          >
            {fromEji ? "EJI" : "extra"}
          </span>
          {prov && (
            <span className="rounded bg-[#243041] px-1.5 py-0.5 font-mono text-[10px] text-[#7a8a9a]">
              {prov}
            </span>
          )}
        </div>
        <span className={status.className}>{status.label}</span>
        {row._meta.notes[0] && (
          <div className="mt-1 max-w-[140px] text-[10px] text-[#7a8a9a]">
            {row._meta.notes[0]}
          </div>
        )}
      </td>
      {EJI_ADATLAP_COLUMNS.map((c) => (
        <td key={c.key} className="px-2 py-2 max-w-[160px] truncate">
          {row[c.key] || "—"}
        </td>
      ))}
      <td className="px-2 py-2 font-mono text-[10px] text-[#7a8a9a]">
        {formatSources(row._meta.sources)}
      </td>
    </tr>
  );
}

function Rules({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-[#243041] bg-[#121820] p-4 text-sm">
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-[#9aabbc]">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}
