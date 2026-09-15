"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type Confidence = "strong" | "review";

type ForeignPair = {
  source: string;
  label: string;
  performer: string;
  title: string;
  isrc: string | null;
  file: string;
  confidence: Confidence;
};

type Recording = {
  id: string;
  title: string;
  mainArtist: string;
  year: number | null;
  publisher: string | null;
  tipus: string;
  foreignPairs: ForeignPair[];
  ejiOnly: boolean;
};

type Orphan = {
  source: string;
  label: string;
  performer: string;
  title: string;
  isrc: string | null;
  file: string;
  matchNote: string;
};

type Hero = {
  id: string;
  name: string;
  kind: string;
  blurb: string;
  ejiTrackCount: number;
  ejiArtistCount: number;
  foreignHitTotal: number;
  foreignBySource: Record<string, number>;
  pairedRecordingCount: number;
  strongPairCount: number;
  reviewPairCount: number;
  ejiOnlyCount: number;
  orphanForeignCount: number;
  ejiArtists: { refId: string; name: string; distributionPeriod: string }[];
  recordings: Recording[];
  orphanForeign: Orphan[];
  ejiFetchedAt?: string;
  fromCache?: boolean;
  rosterMatched?: boolean;
};

type Source = {
  id: string;
  label: string;
  region: string;
  role?: string;
  hits?: number | null;
  note?: string;
};

type PipelineStep = {
  id: string;
  label: string;
  autoPct: number;
  note: string;
};

type RosterSuggest = {
  id: string;
  name: string;
  kind: string;
  aliases: string[];
  foreignHitTotal: number;
};

export type RadarData = {
  title: string;
  subtitle: string;
  generated: string;
  defaultHeroId: string;
  macro: {
    rosterActs: number;
    actsWithForeignHits: number;
    foreignHitsBySource: Record<string, number>;
    indexTotalRows?: number;
    sources: Source[];
    pipeline: PipelineStep[];
  };
  heroes: Hero[];
  rosterSuggest?: RosterSuggest[];
};

const SCENES = [
  { id: "radar", label: "Radar" },
  { id: "xray", label: "Felvétel" },
  { id: "factory", label: "Automata" },
  { id: "mirror", label: "Tükör" },
] as const;

type SceneId = (typeof SCENES)[number]["id"];

const NODE_POS: Record<string, { x: number; y: number }> = {
  "hu-eji": { x: 50, y: 48 },
  "de-gvl": { x: 38, y: 28 },
  "nl-sena": { x: 22, y: 34 },
  "ee-eel": { x: 68, y: 22 },
  "fi-gramex": { x: 72, y: 38 },
  "cz-intergram": { x: 58, y: 72 },
  "ro-credidam": { x: 78, y: 68 },
};

function fmt(n: number) {
  return n.toLocaleString("hu-HU");
}

function foldSuggest(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function NeighbouringRadarDemo({ data }: { data: RadarData }) {
  const [scene, setScene] = useState<SceneId>("radar");
  const [heroId, setHeroId] = useState(data.defaultHeroId);
  const [liveHero, setLiveHero] = useState<Hero | null>(null);
  const [selectedRecId, setSelectedRecId] = useState<string | null>(null);
  const [pipelineStep, setPipelineStep] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const roster = data.rosterSuggest ?? [];

  const suggestions = useMemo(() => {
    const q = foldSuggest(query);
    if (q.length < 1) return roster.slice(0, 8);
    return roster
      .filter((a) => {
        const hay = [a.name, ...a.aliases].map(foldSuggest);
        return hay.some((h) => h.includes(q));
      })
      .slice(0, 8);
  }, [query, roster]);

  const hero = useMemo(() => {
    if (liveHero) return liveHero;
    return null;
  }, [liveHero]);

  const pairedRecs = useMemo(
    () => (hero ? hero.recordings.filter((r) => r.foreignPairs.length > 0) : []),
    [hero],
  );
  const ejiOnlyRecs = useMemo(
    () => (hero ? hero.recordings.filter((r) => r.ejiOnly).slice(0, 12) : []),
    [hero],
  );

  const selected = hero
    ? hero.recordings.find((r) => r.id === selectedRecId) ??
      pairedRecs[0] ??
      hero.recordings[0] ??
      null
    : null;

  async function runSearch(raw: string) {
    const q = raw.trim();
    if (q.length < 2) return;
    setSearching(true);
    setSearchError(null);
    setSearchOpen(false);
    try {
      const res = await fetch(
        `/api/demo/neighbouring-search?q=${encodeURIComponent(q)}`,
      );
      const body = (await res.json()) as { act?: Hero; error?: string };
      if (!res.ok || !body.act) {
        throw new Error(body.error || "Keresés sikertelen");
      }
      setLiveHero(body.act);
      setHeroId(body.act.id);
      setSelectedRecId(null);
      setQuery(body.act.name);
      setScene("xray");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Keresési hiba");
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    setSelectedRecId(null);
  }, [heroId]);

  useEffect(() => {
    const t = setInterval(() => setPulse((p) => p + 1), 2200);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (scene !== "factory") return;
    const t = setInterval(() => {
      setPipelineStep((s) => (s + 1) % data.macro.pipeline.length);
    }, 1600);
    return () => clearInterval(t);
  }, [scene, data.macro.pipeline.length]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setScene((cur) => {
          const i = SCENES.findIndex((s) => s.id === cur);
          return SCENES[(i + 1) % SCENES.length].id;
        });
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setScene((cur) => {
          const i = SCENES.findIndex((s) => s.id === cur);
          return SCENES[(i - 1 + SCENES.length) % SCENES.length].id;
        });
      }
      if (e.key >= "1" && e.key <= "4") {
        setScene(SCENES[Number(e.key) - 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const totalForeign = Object.values(data.macro.foreignHitsBySource).reduce(
    (a, b) => a + b,
    0,
  );

  return (
    <div className="radar-root fixed inset-0 z-50 overflow-hidden text-[var(--r-fg)]">
      <div className="radar-bg" aria-hidden />
      <div className="radar-grid" aria-hidden />

      <header className="relative z-10 flex flex-col gap-4 px-8 pb-2 pt-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="radar-mono text-[11px] uppercase tracking-[0.28em] text-[var(--r-muted)]">
            Eastaste · Recovery Ops · local demo
          </p>
          <h1 className="radar-display mt-1 text-3xl font-extrabold tracking-tight md:text-4xl">
            {data.title}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--r-secondary)] md:text-base">
            {data.subtitle}
          </p>
        </div>

        <div className="w-full max-w-md shrink-0">
          <form
            className="relative"
            onSubmit={(e) => {
              e.preventDefault();
              void runSearch(query);
            }}
          >
            <label className="radar-mono sr-only" htmlFor="radar-search">
              Előadó / zenekar keresés
            </label>
            <div className="flex gap-2">
              <input
                id="radar-search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                  setSearchError(null);
                }}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setSearchOpen(false), 150);
                }}
                placeholder="Keresés: pl. Quimby, Ákos, Beton.Hofi…"
                autoComplete="off"
                className="radar-mono w-full rounded-xl border border-[var(--r-border)] bg-[rgba(12,16,24,0.85)] px-3 py-2.5 text-sm text-[var(--r-fg)] outline-none placeholder:text-[var(--r-muted)] focus:border-[var(--r-accent)]"
              />
              <button
                type="submit"
                disabled={searching || query.trim().length < 2}
                className="radar-mono shrink-0 rounded-xl bg-[var(--r-accent)] px-4 py-2 text-xs font-semibold uppercase tracking-wider text-[#1a1008] disabled:opacity-40"
              >
                {searching ? "…" : "Scan"}
              </button>
            </div>
            {searchOpen && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--r-border)] bg-[#10141c] py-1 shadow-xl">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[rgba(212,165,116,0.1)]"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setQuery(s.name);
                        void runSearch(s.name);
                      }}
                    >
                      <span>
                        <span className="font-medium">{s.name}</span>
                        <span className="radar-mono ml-2 text-[10px] text-[var(--r-muted)]">
                          {s.kind}
                        </span>
                      </span>
                      <span className="radar-mono text-[10px] text-[var(--r-match)]">
                        UP {s.foreignHitTotal}
                      </span>
                    </button>
                  </li>
                ))}
                <li className="border-t border-[var(--r-border)] px-3 py-2 radar-mono text-[10px] text-[var(--r-muted)]">
                  Enter = élő EJI scan + neighbouring párosítás
                </li>
              </ul>
            )}
          </form>
          {searchError && (
            <p className="mt-1 text-xs text-[var(--r-gap)]">{searchError}</p>
          )}
          {searching && (
            <p className="radar-mono mt-1 text-[11px] text-[var(--r-eji)]">
              EJI jogosultkutatás + UP matching…
            </p>
          )}
        </div>
      </header>

      <nav className="relative z-10 mx-8 flex flex-wrap gap-2 border-b border-[var(--r-border)] pb-3">
        {SCENES.map((s, i) => {
          const active = scene === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setScene(s.id)}
              className={`radar-mono rounded-full px-4 py-1.5 text-xs uppercase tracking-wider transition ${
                active
                  ? "bg-[var(--r-accent)] text-[#1a1008]"
                  : "border border-[var(--r-border)] text-[var(--r-secondary)] hover:border-[var(--r-accent-dim)] hover:text-[var(--r-fg)]"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          );
        })}
        <span className="ml-auto hidden self-center radar-mono text-[10px] text-[var(--r-muted)] md:inline">
          ← → · 1–4 · kereső fent
        </span>
      </nav>

      <div className="relative z-10 h-[calc(100%-11rem)] overflow-y-auto px-8 py-5">
        {scene === "radar" && (
          <SceneRadar
            data={data}
            totalForeign={totalForeign}
            pulse={pulse}
          />
        )}
        {scene === "xray" &&
          (hero ? (
            <SceneXray
              hero={hero}
              live={Boolean(liveHero && liveHero.id === hero.id)}
              onLiveSearch={(name) => void runSearch(name)}
              selected={selected}
              setSelectedRecId={setSelectedRecId}
              pairedRecs={pairedRecs}
              ejiOnlyRecs={ejiOnlyRecs}
            />
          ) : (
            <EmptySearchPrompt />
          ))}
        {scene === "factory" &&
          (hero ? (
            <SceneFactory
              pipeline={data.macro.pipeline}
              active={pipelineStep}
              setActive={setPipelineStep}
              hero={hero}
            />
          ) : (
            <EmptySearchPrompt />
          ))}
        {scene === "mirror" &&
          (hero ? <SceneMirror hero={hero} data={data} /> : <EmptySearchPrompt />)}
      </div>

      <style jsx global>{`
        .radar-root {
          --r-bg: #0a0c10;
          --r-fg: #eef2f6;
          --r-secondary: #9aa8b8;
          --r-muted: #5c6b7c;
          --r-border: #243041;
          --r-accent: #d4a574;
          --r-accent-dim: #8a6544;
          --r-match: #3dcea0;
          --r-review: #e0b45c;
          --r-eji: #6ea8ff;
          --r-gap: #e07a6a;
          font-family: var(--font-radar-display), ui-sans-serif, system-ui, sans-serif;
          background: var(--r-bg);
        }
        .radar-display {
          font-family: var(--font-radar-display), ui-sans-serif, system-ui, sans-serif;
        }
        .radar-mono {
          font-family: var(--font-radar-mono), ui-monospace, monospace;
        }
        .radar-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212, 165, 116, 0.14), transparent 55%),
            radial-gradient(ellipse 40% 40% at 85% 70%, rgba(110, 168, 255, 0.08), transparent 50%),
            radial-gradient(ellipse 35% 35% at 10% 80%, rgba(61, 206, 160, 0.06), transparent 50%),
            var(--r-bg);
        }
        .radar-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(36, 48, 65, 0.45) 1px, transparent 1px),
            linear-gradient(90deg, rgba(36, 48, 65, 0.45) 1px, transparent 1px);
          background-size: 48px 48px;
          mask-image: radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent);
          pointer-events: none;
        }
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .radar-sweep {
          animation: radar-sweep 8s linear infinite;
          transform-origin: 50% 50%;
        }
        @keyframes radar-breathe {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.85; }
        }
        .radar-breathe {
          animation: radar-breathe 2.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

function EmptySearchPrompt() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-center">
      <p className="radar-display text-xl font-semibold">Írj be egy előadót felül</p>
      <p className="max-w-md text-sm text-[var(--r-secondary)]">
        Scan után jön az EJI felvétellista és a külföldi UP párosítás (pl. SNYL → EJI + GVL).
      </p>
    </div>
  );
}

function SceneRadar({
  data,
  totalForeign,
  pulse,
}: {
  data: RadarData;
  totalForeign: number;
  pulse: number;
}) {
  const sources = data.macro.sources;
  const ejiHeroTracks = data.heroes.reduce((s, h) => s + h.ejiTrackCount, 0);
  const pairedTotal = data.heroes.reduce((s, h) => s + h.pairedRecordingCount, 0);

  return (
    <div className="grid h-full min-h-[520px] gap-6 lg:grid-cols-[1.35fr_1fr]">
      <div className="relative min-h-[420px] rounded-2xl border border-[var(--r-border)] bg-[rgba(12,16,24,0.65)] p-4">
        <p className="radar-mono mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--r-muted)]">
          Teljes neighbouring UP index · {fmt(data.macro.indexTotalRows ?? totalForeign)} sor
        </p>
        <svg viewBox="0 0 100 100" className="h-[min(58vh,520px)] w-full">
          <circle
            cx="50"
            cy="48"
            r="38"
            fill="none"
            stroke="rgba(36,48,65,0.9)"
            strokeWidth="0.35"
          />
          <circle
            cx="50"
            cy="48"
            r="26"
            fill="none"
            stroke="rgba(36,48,65,0.7)"
            strokeWidth="0.3"
          />
          <circle
            cx="50"
            cy="48"
            r="14"
            fill="none"
            stroke="rgba(212,165,116,0.25)"
            strokeWidth="0.35"
          />
          <g className="radar-sweep" style={{ transformBox: "fill-box", transformOrigin: "50px 48px" }}>
            <path
              d="M50 48 L50 10 A38 38 0 0 1 78 28 Z"
              fill="url(#sweep)"
              opacity="0.35"
            />
          </g>
          <defs>
            <linearGradient id="sweep" x1="50" y1="48" x2="70" y2="20" gradientUnits="userSpaceOnUse">
              <stop stopColor="#d4a574" stopOpacity="0.55" />
              <stop offset="1" stopColor="#d4a574" stopOpacity="0" />
            </linearGradient>
          </defs>

          {sources
            .filter((s) => s.id !== "hu-eji")
            .map((s) => {
              const from = NODE_POS["hu-eji"];
              const to = NODE_POS[s.id];
              if (!to) return null;
              const hits = s.hits ?? 0;
              const thick = Math.min(1.6, 0.2 + Math.log10(Math.max(hits, 1)) / 4);
              return (
                <line
                  key={`edge-${s.id}`}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={hits > 0 ? "rgba(61,206,160,0.45)" : "rgba(36,48,65,0.8)"}
                  strokeWidth={thick}
                  className={hits > 0 ? "radar-breathe" : undefined}
                  style={hits > 0 ? { animationDelay: `${(pulse + hits) % 5}00ms` } : undefined}
                />
              );
            })}

          {sources.map((s) => {
            const pos = NODE_POS[s.id];
            if (!pos) return null;
            const isHome = s.role === "home";
            const hits = s.hits;
            const r = isHome ? 5.2 : 3.2 + Math.min(2.8, Math.log10(Math.max(hits ?? 1, 1)));
            return (
              <g key={s.id}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={isHome ? "rgba(110,168,255,0.25)" : "rgba(12,16,24,0.9)"}
                  stroke={isHome ? "var(--r-eji)" : hits ? "var(--r-match)" : "var(--r-border)"}
                  strokeWidth={isHome ? 0.7 : 0.45}
                />
                <text
                  x={pos.x}
                  y={pos.y - r - 1.8}
                  textAnchor="middle"
                  fill="var(--r-fg)"
                  style={{ fontSize: "3.2px", fontFamily: "var(--font-radar-mono)" }}
                >
                  {s.label}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 1.1}
                  textAnchor="middle"
                  fill={isHome ? "var(--r-eji)" : "var(--r-secondary)"}
                  style={{ fontSize: "2.8px", fontFamily: "var(--font-radar-mono)" }}
                >
                  {isHome ? "HOME" : fmt(hits ?? 0)}
                </text>
              </g>
            );
          })}
        </svg>
        <p className="radar-mono text-center text-[11px] text-[var(--r-muted)]">
          Node-számok: azonosítatlan / KONU sorok forrásonként. Keresés: performer-egyezés minden
          forrásban + EJI párosítás.
        </p>
      </div>

      <div className="flex flex-col gap-4">
          <Stat
            label="UP index (összes)"
            value={fmt(data.macro.indexTotalRows ?? totalForeign)}
            hint="6 neighbouring forrás"
            accent="match"
          />
          <Stat
            label="HU act a rosterben"
            value={fmt(data.macro.rosterActs)}
            hint={`${fmt(data.macro.actsWithForeignHits)} metszik a mintában`}
          />
          <Stat
            label="EJI felvétel (minták)"
            value={fmt(ejiHeroTracks)}
            hint="jogosultkutatás track tab"
            accent="eji"
          />
          <Stat
            label="Párosított (minták)"
            value={fmt(pairedTotal)}
            hint="EJI cím ↔ külföldi UP"
            accent="accent"
          />

        <div className="flex-1 rounded-2xl border border-[var(--r-border)] bg-[rgba(12,16,24,0.65)] p-4">
          <p className="radar-mono text-[11px] uppercase tracking-[0.2em] text-[var(--r-muted)]">
            Keresés
          </p>
          <p className="mt-3 text-sm text-[var(--r-secondary)]">
            Fent írd be az előadó / zenekar nevét, majd Scan. Élő EJI tracklista +
            neighbouring / GVL UP párosítás jön fel a Felvétel nézetben.
          </p>
          <p className="radar-mono mt-4 text-[11px] text-[var(--r-muted)]">
            Roster typeahead: {data.rosterSuggest?.length ?? data.macro.rosterActs} HU act ·
            Enter = élő scan
          </p>
        </div>
      </div>
    </div>
  );
}

function SceneXray({
  hero,
  live,
  onLiveSearch,
  selected,
  setSelectedRecId,
  pairedRecs,
  ejiOnlyRecs,
}: {
  hero: Hero;
  live: boolean;
  onLiveSearch: (name: string) => void;
  selected: Recording | null;
  setSelectedRecId: (id: string) => void;
  pairedRecs: Recording[];
  ejiOnlyRecs: Recording[];
}) {
  return (
    <div className="flex h-full min-h-[520px] flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="radar-display text-2xl font-bold tracking-tight">{hero.name}</h2>
            {live && (
              <span className="radar-mono rounded-full bg-[var(--r-accent)] px-2 py-0.5 text-[10px] font-semibold uppercase text-[#1a1008]">
                élő scan
              </span>
            )}
            <button
              type="button"
              onClick={() => onLiveSearch(hero.name)}
              className="rounded-full border border-dashed border-[var(--r-accent-dim)] px-3 py-1 text-xs text-[var(--r-accent)] hover:border-[var(--r-accent)]"
            >
              Újra scan
            </button>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-[var(--r-secondary)]">{hero.blurb}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <MiniStat label="EJI track" value={hero.ejiTrackCount} tone="eji" />
        <MiniStat label="EJI artist" value={hero.ejiArtistCount} tone="eji" />
        <MiniStat label="Külföldi UP" value={hero.foreignHitTotal} tone="match" />
        <MiniStat label="Párosítva" value={hero.pairedRecordingCount} tone="accent" />
        <MiniStat label="Csak EJI" value={hero.ejiOnlyCount} tone="muted" />
        <MiniStat label="Orphan UP" value={hero.orphanForeignCount} tone="gap" />
      </div>

      {hero.ejiArtists.length > 0 && (
        <div className="rounded-xl border border-[var(--r-eji)]/40 bg-[rgba(110,168,255,0.08)] px-4 py-3">
          <p className="radar-mono text-[10px] uppercase tracking-wider text-[var(--r-eji)]">
            EJI artist-tab · függő / felosztási period
          </p>
          {hero.ejiArtists.map((a) => (
            <p key={a.refId} className="mt-1 text-sm text-[var(--r-secondary)]">
              <span className="font-semibold text-[var(--r-fg)]">{a.name}</span>
              {" — "}
              {a.distributionPeriod}
            </p>
          ))}
        </div>
      )}

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1fr_1.15fr_0.95fr]">
        <Panel title="EJI felvételek" badge={`${hero.recordings.length} mutatva`}>
          {pairedRecs.length > 0 && (
            <SectionLabel color="var(--r-match)">Párosított</SectionLabel>
          )}
          {pairedRecs.map((r) => (
            <RecRow
              key={r.id}
              rec={r}
              active={selected?.id === r.id}
              onClick={() => setSelectedRecId(r.id)}
              tag="PAIR"
              tagColor="var(--r-match)"
            />
          ))}
          <SectionLabel color="var(--r-eji)">Csak EJI (még nincs külföldi pár)</SectionLabel>
          {ejiOnlyRecs.map((r) => (
            <RecRow
              key={r.id}
              rec={r}
              active={selected?.id === r.id}
              onClick={() => setSelectedRecId(r.id)}
              tag="EJI"
              tagColor="var(--r-eji)"
            />
          ))}
        </Panel>

        <Panel title="Kiválasztott felvétel" badge="master objektum">
          {selected ? (
            <div className="space-y-4">
              <div>
                <h3 className="text-xl font-bold tracking-tight">{selected.title}</h3>
                <p className="mt-1 text-sm text-[var(--r-secondary)]">{selected.mainArtist}</p>
                <p className="radar-mono mt-2 text-[11px] text-[var(--r-muted)]">
                  EJI id {selected.id}
                  {selected.year ? ` · ${selected.year}` : ""}
                  {selected.publisher ? ` · ${selected.publisher}` : ""}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--r-eji)]/50 bg-[rgba(110,168,255,0.07)] p-3">
                <p className="radar-mono text-[10px] uppercase tracking-wider text-[var(--r-eji)]">
                  EJI oldal
                </p>
                <p className="mt-1 text-sm">Bent a jogosultkutatásban · párosítás kiindulópont</p>
              </div>

              {selected.foreignPairs.length > 0 ? (
                <div className="space-y-2">
                  <p className="radar-mono text-[10px] uppercase tracking-wider text-[var(--r-match)]">
                    Külföldi párok
                  </p>
                  {selected.foreignPairs.map((p, i) => (
                    <div
                      key={`${p.source}-${i}`}
                      className="rounded-xl border border-[var(--r-match)]/40 bg-[rgba(61,206,160,0.07)] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{p.label}</span>
                        <ConfBadge c={p.confidence} />
                      </div>
                      <p className="mt-1 text-sm">{p.title}</p>
                      <p className="radar-mono mt-1 text-[10px] text-[var(--r-muted)]">
                        {p.performer}
                        {p.isrc ? ` · ISRC ${p.isrc}` : " · ISRC hiányzik"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[var(--r-border)] p-4 text-sm text-[var(--r-secondary)]">
                  Ehhez az EJI felvételhez még nincs automatikus külföldi pár.
                  <span className="mt-1 block text-[var(--r-muted)]">
                    Következő lépés: ISRC / katalógus enrichment, majd újra scan.
                  </span>
                </div>
              )}

              <MatchFlow hasPair={selected.foreignPairs.length > 0} />
            </div>
          ) : (
            <p className="text-sm text-[var(--r-muted)]">Nincs felvétel.</p>
          )}
        </Panel>

        <Panel title="Orphan külföldi UP" badge="EJI-re vár">
          {hero.orphanForeign.length === 0 ? (
            <p className="text-sm text-[var(--r-muted)]">Nincs orphan — vagy nincs külföldi hit.</p>
          ) : (
            hero.orphanForeign.map((o, i) => (
              <div
                key={`${o.source}-${i}`}
                className="mb-2 rounded-xl border border-[var(--r-gap)]/35 bg-[rgba(224,122,106,0.06)] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="radar-mono text-[11px] text-[var(--r-gap)]">{o.label}</span>
                  {o.isrc && (
                    <span className="radar-mono text-[10px] text-[var(--r-accent)]">{o.isrc}</span>
                  )}
                </div>
                <p className="mt-0.5 text-sm font-medium">{o.title}</p>
                <p className="radar-mono text-[10px] text-[var(--r-muted)]">{o.performer}</p>
                <p className="mt-1 text-[11px] text-[var(--r-secondary)]">{o.matchNote}</p>
              </div>
            ))
          )}
        </Panel>
      </div>
    </div>
  );
}

function SceneFactory({
  pipeline,
  active,
  setActive,
  hero,
}: {
  pipeline: PipelineStep[];
  active: number;
  setActive: (n: number) => void;
  hero: Hero;
}) {
  const autoHeavy = pipeline.filter((p) => p.autoPct >= 80).length;
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      <div className="text-center">
        <h2 className="radar-display text-2xl font-bold md:text-3xl">Matching factory</h2>
        <p className="mt-2 text-sm text-[var(--r-secondary)] md:text-base">
          Ugyanaz a felvétel az EJI-n és a külföldi UP-listákon — a drága rész automata, a kapu emberi.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Lépés automata ≥80%" value={`${autoHeavy}/${pipeline.length}`} accent="match" />
        <Stat
          label={`${hero.name}: EJI scan`}
          value={fmt(hero.ejiTrackCount)}
          hint="másodperc alatt"
          accent="eji"
        />
        <Stat
          label="Emberi review sor"
          value={fmt(hero.reviewPairCount + hero.orphanForeignCount)}
          hint="sárga + orphan"
          accent="accent"
        />
      </div>

      <div className="relative overflow-x-auto pb-2">
        <div className="flex min-w-[720px] items-stretch gap-2">
          {pipeline.map((step, i) => {
            const on = i === active;
            const done = i < active;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActive(i)}
                className={`relative flex flex-1 flex-col rounded-2xl border px-3 py-4 text-left transition ${
                  on
                    ? "border-[var(--r-accent)] bg-[rgba(212,165,116,0.12)]"
                    : done
                      ? "border-[var(--r-match)]/40 bg-[rgba(61,206,160,0.06)]"
                      : "border-[var(--r-border)] bg-[rgba(12,16,24,0.5)]"
                }`}
              >
                <span className="radar-mono text-[10px] text-[var(--r-muted)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mt-1 text-sm font-semibold leading-snug">{step.label}</span>
                <span className="mt-2 radar-mono text-[11px] text-[var(--r-secondary)]">
                  {step.note}
                </span>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--r-border)]">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${step.autoPct}%`,
                      background:
                        step.autoPct >= 80
                          ? "var(--r-match)"
                          : step.autoPct >= 40
                            ? "var(--r-review)"
                            : "var(--r-gap)",
                    }}
                  />
                </div>
                <span className="radar-mono mt-1 text-[11px] text-[var(--r-fg)]">
                  ~{step.autoPct}% auto
                </span>
                {i < pipeline.length - 1 && (
                  <span
                    className="pointer-events-none absolute -right-2 top-1/2 z-10 hidden -translate-y-1/2 text-[var(--r-muted)] sm:block"
                    aria-hidden
                  >
                    →
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--r-gap)]/40 bg-[rgba(224,122,106,0.06)] p-5">
          <p className="radar-mono text-[11px] uppercase tracking-wider text-[var(--r-gap)]">
            Ma · kézi világ
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">~45–90 perc</p>
          <p className="mt-1 text-sm text-[var(--r-secondary)]">
            1 előadó × EJI web + 6 CMO portál / Excel · másolás, elírás, elfelejtett alias
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--r-match)]/40 bg-[rgba(61,206,160,0.07)] p-5">
          <p className="radar-mono text-[11px] uppercase tracking-wider text-[var(--r-match)]">
            Radar · motor
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight">&lt; 30 mp + review</p>
          <p className="mt-1 text-sm text-[var(--r-secondary)]">
            Párhuzamos EJI + UP scan · score · csak sárga megy emberhez · hit-CSV kimenet
          </p>
        </div>
      </div>
    </div>
  );
}

function SceneMirror({ hero, data }: { hero: Hero; data: RadarData }) {
  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      <div className="text-center">
        <h2 className="radar-display text-2xl font-bold md:text-3xl">Tükör · két claim-irány</h2>
        <p className="mt-2 text-sm text-[var(--r-secondary)]">
          Ugyanaz a matching-motor két üzleti úton: magyar előadó pénze vissza HU-ba, illetve
          EJI függő külföldi nevek kiszórása testvér-CMO felé.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--r-match)]/45 bg-[rgba(61,206,160,0.06)] p-6">
          <p className="radar-mono text-[11px] uppercase tracking-[0.2em] text-[var(--r-match)]">
            A · Repatriáció
          </p>
          <h3 className="mt-2 text-xl font-bold">HU előadó a külföldi UP-listákon</h3>
          <ol className="mt-4 space-y-3 text-sm text-[var(--r-secondary)]">
            <li>
              <span className="text-[var(--r-fg)]">1.</span> GVL / SENA / … azonosítatlanon magyar név
            </li>
            <li>
              <span className="text-[var(--r-fg)]">2.</span> Párosítás EJI felvétellel / identityvel
            </li>
            <li>
              <span className="text-[var(--r-fg)]">3.</span> Claim út: külföldi CMO → EJI → tag
            </li>
          </ol>
          <p className="radar-mono mt-5 text-[11px] text-[var(--r-muted)]">
            Most: {hero.name} · {hero.foreignHitTotal} külföldi hit · {hero.pairedRecordingCount}{" "}
            EJI-pár
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--r-eji)]/45 bg-[rgba(110,168,255,0.07)] p-6">
          <p className="radar-mono text-[11px] uppercase tracking-[0.2em] text-[var(--r-eji)]">
            B · Külföldi kiszórás
          </p>
          <h3 className="mt-2 text-xl font-bold">EJI függő → testvér-CMO / IPN</h3>
          <ol className="mt-4 space-y-3 text-sm text-[var(--r-secondary)]">
            <li>
              <span className="text-[var(--r-fg)]">1.</span> EJI artist / függő név (aggregátum vagy
              mandátum)
            </li>
            <li>
              <span className="text-[var(--r-fg)]">2.</span> Matching GVL / PPL / SENA / IPN felé
            </li>
            <li>
              <span className="text-[var(--r-fg)]">3.</span> Megrendelő: EJI (CMO-vendor), fee confirmed
              match után
            </li>
          </ol>
          <p className="radar-mono mt-5 text-[11px] text-[var(--r-muted)]">
            {hero.ejiArtistCount > 0
              ? `${hero.name}: EJI artist-tab period látszik`
              : `${hero.name}: artist-tab üres ebben a scanben · track oldal aktív`}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--r-border)] bg-[rgba(12,16,24,0.65)] p-6 text-center">
        <p className="text-lg font-semibold tracking-tight md:text-xl">
          Matching egyszer épül; a két irány a megrendelőben és a claim csatornában különbözik.
        </p>
        <p className="mt-2 text-sm text-[var(--r-secondary)]">
          {data.macro.actsWithForeignHits} HU act metszik a külföldi UP-listákat a rosternél · a
          Felvétel nézet mutatja az EJI ↔ UP gapet névre.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: "match" | "eji" | "accent";
}) {
  const color =
    accent === "match"
      ? "var(--r-match)"
      : accent === "eji"
        ? "var(--r-eji)"
        : accent === "accent"
          ? "var(--r-accent)"
          : "var(--r-fg)";
  return (
    <div className="rounded-2xl border border-[var(--r-border)] bg-[rgba(12,16,24,0.65)] p-4">
      <p className="radar-mono text-[10px] uppercase tracking-wider text-[var(--r-muted)]">
        {label}
      </p>
      <p className="mt-1 text-3xl font-bold tracking-tight" style={{ color }}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--r-muted)]">{hint}</p>}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "eji" | "match" | "accent" | "muted" | "gap";
}) {
  const color = {
    eji: "var(--r-eji)",
    match: "var(--r-match)",
    accent: "var(--r-accent)",
    muted: "var(--r-secondary)",
    gap: "var(--r-gap)",
  }[tone];
  return (
    <div className="rounded-xl border border-[var(--r-border)] px-3 py-2">
      <p className="radar-mono text-[9px] uppercase tracking-wider text-[var(--r-muted)]">
        {label}
      </p>
      <p className="text-xl font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function Panel({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] flex-col overflow-hidden rounded-2xl border border-[var(--r-border)] bg-[rgba(12,16,24,0.65)]">
      <div className="flex items-center justify-between border-b border-[var(--r-border)] px-3 py-2">
        <p className="radar-mono text-[11px] uppercase tracking-wider text-[var(--r-muted)]">
          {title}
        </p>
        {badge && (
          <span className="radar-mono text-[10px] text-[var(--r-accent-dim)]">{badge}</span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">{children}</div>
    </div>
  );
}

function SectionLabel({ color, children }: { color: string; children: ReactNode }) {
  return (
    <p
      className="radar-mono mb-1 mt-2 px-1 text-[10px] uppercase tracking-wider first:mt-0"
      style={{ color }}
    >
      {children}
    </p>
  );
}

function RecRow({
  rec,
  active,
  onClick,
  tag,
  tagColor,
}: {
  rec: Recording;
  active: boolean;
  onClick: () => void;
  tag: string;
  tagColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition ${
        active
          ? "bg-[rgba(212,165,116,0.14)] ring-1 ring-[var(--r-accent-dim)]"
          : "hover:bg-[rgba(255,255,255,0.03)]"
      }`}
    >
      <span
        className="radar-mono mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px]"
        style={{ color: tagColor, border: `1px solid ${tagColor}55` }}
      >
        {tag}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{rec.title}</span>
        <span className="radar-mono block truncate text-[10px] text-[var(--r-muted)]">
          {rec.mainArtist}
        </span>
      </span>
    </button>
  );
}

function ConfBadge({ c }: { c: Confidence }) {
  const strong = c === "strong";
  return (
    <span
      className="radar-mono rounded-full px-2 py-0.5 text-[10px] uppercase"
      style={{
        color: strong ? "var(--r-match)" : "var(--r-review)",
        border: `1px solid ${strong ? "var(--r-match)" : "var(--r-review)"}66`,
      }}
    >
      {strong ? "strong" : "review"}
    </span>
  );
}

function MatchFlow({ hasPair }: { hasPair: boolean }) {
  return (
    <div className="radar-mono flex items-center justify-center gap-2 text-[11px] text-[var(--r-muted)]">
      <span className="rounded-full border border-[var(--r-eji)] px-2 py-1 text-[var(--r-eji)]">
        EJI
      </span>
      <span>── {hasPair ? "párosítva" : "gap"} ──</span>
      <span
        className={`rounded-full border px-2 py-1 ${
          hasPair
            ? "border-[var(--r-match)] text-[var(--r-match)]"
            : "border-[var(--r-gap)] text-[var(--r-gap)]"
        }`}
      >
        külföldi UP
      </span>
    </div>
  );
}
