"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe2,
  Loader2,
  Lock,
  Music4,
  Search,
  SearchX,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type {
  LandingTeaserGroup,
  LandingTeaserHit,
  LandingTeaserResult,
} from "@/lib/landing-teaser";

/**
 * Warm "recovery partner" landing.
 * The search hits the real, gated teaser endpoint (/api/landing-search) for the
 * fast sources (ARTISJUS, EJI, EU CMO). MLC (USA) is intentionally excluded
 * here: its scan takes minutes and belongs to the full audit after the gate.
 * Only aggregated totals + a few sample titles are returned; the full hit list
 * stays server-side behind the email gate.
 */

type Phase = "idle" | "loading" | "result";

type SearchStatus = LandingTeaserResult["status"] | "error";

const EMPTY_SUMMARY = { totalItems: 0, societies: 0, countries: 0 };

/** Preview-only color palettes. Scoped to the landing via CSS vars on the root. */
type Palette = {
  id: string;
  name: string;
  /** main accent (buttons, highlights) */
  primary: string;
  /** complementary accent (gradient blob, secondary glow) */
  comp: string;
};

const PALETTES: Palette[] = [
  { id: "sunset", name: "Naplemente", primary: "#7c3aed", comp: "#f43f5e" },
  { id: "indigo", name: "Indigó · Pink", primary: "#6366f1", comp: "#ec4899" },
  { id: "ocean", name: "Óceán · Borostyán", primary: "#2563eb", comp: "#f59e0b" },
  { id: "aurora", name: "Aurora", primary: "#06b6d4", comp: "#a855f7" },
  { id: "emerald", name: "Smaragd · Lila", primary: "#10b981", comp: "#8b5cf6" },
  { id: "magma", name: "Magma", primary: "#f97316", comp: "#e11d48" },
  { id: "teal", name: "Teal · Korall", primary: "#0d9488", comp: "#fb7185" },
];

const SOURCE_GROUPS: { region: string; flag: string; items: string[] }[] = [
  { region: "Magyarország", flag: "🇭🇺", items: ["ARTISJUS", "EJI"] },
  {
    region: "Európa",
    flag: "🇪🇺",
    items: [
      "GVL (DE)",
      "STIM (SE)",
      "SENA (NL)",
      "AKM (AT)",
      "SOZA (SK)",
      "INTERGRAM (CZ)",
      "Gramex (FI)",
      "CREDIDAM (RO)",
      "HDS-ZAMP (HR)",
      "SPEDIDAM (FR)",
      "SAMI (SE)",
    ],
  },
];

const HOW_STEPS = [
  {
    icon: Search,
    title: "Beírod a neved",
    text: "Csak az előadóneved kell, az, amit a kiadványokon és a streamingen használsz. Nem kell jogi név vagy regisztráció.",
  },
  {
    icon: Globe2,
    title: "Megkeressük a pénzed",
    text: "Átnézzük a magyar ARTISJUS és EJI, valamint 10+ ország jogkezelőinek nyilvános listáit, és kiderítjük, hol áll gazdátlanul a jogdíjad.",
  },
  {
    icon: Sparkles,
    title: "Kibogozzuk és hazahozzuk",
    text: "Segítünk rendbe tenni a hiányzó adatokat, és végigvisszük a folyamatot, hogy a pénz oda kerüljön, ahova tartozik: hozzád.",
  },
];

const REASONS = [
  {
    title: "Hiányos metaadat",
    text: "A felvétel megvan, de nincs rendesen műhöz vagy szerzőhöz kötve, így a pénz gazdátlanul áll.",
  },
  {
    title: "Üres vagy rossz IPI",
    text: "A szerzői azonosítód hiányzik vagy elír­ták, így a felosztás nem talál meg.",
  },
  {
    title: "Határon átnyúló lejátszás",
    text: "A zenédet külföldön is játsszák. A jogdíj ott keletkezik, egy másik ország listáján, ahova magadtól sosem jutnál el.",
  },
  {
    title: "Film, TV és streaming",
    text: "A filmes és streaming felosztási sorok különösen gyakran maradnak azonosítatlanul.",
  },
];

const FAQ = [
  {
    q: "Ügyvédkedés ez?",
    a: "Nem. Ez metaadat-audit, nem peres panasz. Nyilvános, hivatalos jogkezelői listákat nézünk át helyetted, és segítünk rendezni a tételeket. Nem fenyegetünk és nem perelünk senkit.",
  },
  {
    q: "Mibe kerül?",
    a: "Az ellenőrzés és az összefoglaló ingyenes. A tényleges visszaszerzéskor dolgozunk együtt, és csak akkor van értelme, ha találtunk valamit. A részleteket előre, átláthatóan megbeszéljük.",
  },
  {
    q: "Mi lesz az adatommal?",
    a: "Csak az előadónevet és (ha megadod) az e-mailed használjuk az összefoglalóhoz. Nem adjuk tovább, és bármikor kérheted a törlését.",
  },
  {
    q: "Honnan vannak a listák?",
    a: "Hivatalos jogkezelők nyilvános, azonosítatlan és kifizetetlen tétel-listáiból: ARTISJUS, EJI, és 10+ ország további szervezetei.",
  },
];

export function RecoveryLanding({ preview = false }: { preview?: boolean }) {
  const [name, setName] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [resolvedName, setResolvedName] = useState("");
  const [groups, setGroups] = useState<LandingTeaserGroup[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("none");
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette>(
    PALETTES.find((p) => p.id === "emerald") ?? PALETTES[0]!,
  );

  const paletteStyle = {
    "--accent-primary": palette.primary,
    "--accent-warning": palette.comp,
    "--border-active": palette.primary,
    "--accent-grad": `linear-gradient(120deg, ${palette.primary} 0%, ${palette.comp} 100%)`,
  } as React.CSSProperties;

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2 || phase === "loading") return;
    setResolvedName(trimmed);
    setPhase("loading");
    setGroups([]);
    setSummary(EMPTY_SUMMARY);
    setEmailSent(false);
    setEmailError(null);
    setEmail("");

    let phase1: LandingTeaserResult | null = null;
    try {
      const res = await fetch("/api/landing-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistName: trimmed }),
      });
      if (res.ok) {
        phase1 = (await res.json().catch(() => null)) as LandingTeaserResult | null;
      }
    } catch {
      phase1 = null;
    }

    if (!phase1) {
      setGroups([]);
      setSummary(EMPTY_SUMMARY);
      setSearchStatus("error");
      setPhase("result");
      return;
    }

    setGroups(phase1.groups);
    setSummary(phase1.summary);
    setSearchStatus(phase1.status);
    setPhase("result");
  }

  async function submitEmail(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || emailSending) return;
    setEmailSending(true);
    setEmailError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          searchedName: resolvedName,
          source: "landing",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Mentés sikertelen. Próbáld újra.");
      }
      setEmailSent(true);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Mentés sikertelen. Próbáld újra.");
    } finally {
      setEmailSending(false);
    }
  }

  return (
    <div className="w-full" style={paletteStyle}>
      {/* PALETTE SWITCHER (preview only, behind ?preview=1) */}
      {preview && (
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-full border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-primary)_92%,transparent)] px-2.5 py-2 shadow-lg backdrop-blur-md">
        <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Téma
        </span>
        {PALETTES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPalette(p)}
            title={p.name}
            aria-label={p.name}
            className={
              "h-6 w-6 rounded-full transition " +
              (palette.id === p.id
                ? "ring-2 ring-[var(--text-primary)] ring-offset-1 ring-offset-[var(--bg-primary)]"
                : "opacity-80 hover:opacity-100")
            }
            style={{
              background: `linear-gradient(135deg, ${p.primary} 0%, ${p.primary} 55%, ${p.comp} 55%, ${p.comp} 100%)`,
            }}
          />
        ))}
      </div>
      )}

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(1200px 620px at 50% -18%, color-mix(in srgb, var(--accent-primary) 38%, transparent), transparent 62%), radial-gradient(820px 520px at 8% -2%, color-mix(in srgb, var(--accent-warning) 30%, transparent), transparent 58%), radial-gradient(760px 520px at 95% 6%, color-mix(in srgb, var(--accent-primary) 24%, transparent), transparent 58%)",
          }}
        />
        <div className="mx-auto max-w-3xl px-4 pb-10 pt-16 text-center md:px-6 md:pt-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)]">
            Zenei jogdíj-visszaszerzés előadóknak és szerzőknek
          </span>

          <h1 className="mt-6 text-balance text-4xl font-bold leading-[1.1] tracking-tight text-[var(--text-primary)] md:text-6xl">
            Vannak elveszett jogdíjaid?{" "}
            <span className="text-grad">Hozzuk haza őket!</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg leading-relaxed text-[var(--text-secondary)]">
            Írd be az előadóneved. Megkeressük a neved a magyar{" "}
            <strong className="font-semibold text-[var(--text-primary)]">ARTISJUS</strong> és{" "}
            <strong className="font-semibold text-[var(--text-primary)]">EJI</strong>, valamint 10+
            ország jogkezelőinek nyilvános listáin, kibogozzuk a hiányzó adatokat, és segítünk
            visszaszerezni a pénzed.
          </p>

          <form
            onSubmit={runSearch}
            className="mx-auto mt-8 flex max-w-xl flex-col gap-2 sm:flex-row"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Előadóneved a kiadványokon"
                className="input-bbox h-12 w-full pl-10 pr-3"
                aria-label="Előadónév"
              />
            </div>
            <button
              type="submit"
              className="cta-grad inline-flex h-12 items-center justify-center gap-2 rounded-[10px] px-6 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
              disabled={phase === "loading"}
            >
              {phase === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Megnézem <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <p className="mx-auto mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            Nyilvános listák alapján. Nem ügyvédi panasz, nem kérünk előleget.
          </p>
        </div>

        {/* TRUST STRIP */}
        <div className="mx-auto max-w-4xl px-4 pb-14 md:px-6">
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-[var(--text-muted)]">
            {["ARTISJUS", "EJI", "GVL", "STIM", "SENA", "SOZA"].map((s) => (
              <span key={s} className="text-[var(--text-secondary)]">
                {s}
              </span>
            ))}
            <span className="rounded-full bg-[var(--bg-elevated)] px-3 py-1 text-xs text-[var(--text-secondary)]">
              15+ jogkezelő · 10+ ország · folyamatosan bővül
            </span>
          </div>
        </div>
      </section>

      {/* VERDICT TEASER */}
      {phase !== "idle" && (
        <section className="mx-auto max-w-3xl px-4 pb-4 md:px-6">
          <VerdictTeaser
            phase={phase}
            status={searchStatus}
            groups={groups}
            summary={summary}
            resolvedName={resolvedName}
            email={email}
            emailSent={emailSent}
            emailSending={emailSending}
            emailError={emailError}
            onEmailChange={setEmail}
            onEmailSubmit={submitEmail}
          />
        </section>
      )}

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-5xl px-4 py-16 md:px-6">
        <SectionHeading
          eyebrow="Hogyan működik"
          title="A kereséstől a hazahozott pénzig"
          subtitle="Nem kérünk regisztrációt vagy szerződést ahhoz, hogy megnézd, van-e kint pénzed. A többiben végig melletted vagyunk."
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {HOW_STEPS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-primary)_14%,transparent)] text-[var(--accent-primary)]">
                  <step.icon className="h-4.5 w-4.5" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {i + 1}. lépés
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-[var(--text-primary)]">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* WHY MONEY STAYS UNPAID */}
      <section className="border-y border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-5xl px-4 py-16 md:px-6">
          <SectionHeading
            eyebrow="Miért marad kint a pénz?"
            title="A jogdíj nem tűnik el, csak nem talál haza"
            subtitle="A legtöbb kifizetetlen tétel mögött nem csalás van, hanem egy apró adathiba, amit ki lehet bogozni."
          />
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {REASONS.map((r) => (
              <div
                key={r.title}
                className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6"
              >
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{r.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{r.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHAT YOU GET / DON'T */}
      <section className="mx-auto max-w-5xl px-4 py-16 md:px-6">
        <SectionHeading
          eyebrow="Átlátható elvárások"
          title="Mit adunk és mit nem"
        />
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-[color-mix(in_srgb,var(--accent-primary)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent-primary)_6%,var(--bg-primary))] p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
              Amit adunk
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                "Forrásonkénti találat: melyik ország melyik listáján",
                "Az érintett tételek típusa (film, streaming, rádió…)",
                "Segítség a tényleges visszaszerzésben, végig melletted",
              ].map((t) => (
                <li key={t} className="flex gap-2.5 text-sm text-[var(--text-secondary)]">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Amit nem ígérünk
            </h3>
            <ul className="mt-4 space-y-3">
              {[
                "Konkrét összeget vagy garantált kifizetést",
                "Hogy minden tétel maradéktalanul visszaszerezhető",
                "Azonnali pénzt, a folyamat időt vesz igénybe",
              ].map((t) => (
                <li key={t} className="flex gap-2.5 text-sm text-[var(--text-secondary)]">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-muted)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* COVERAGE */}
      <section className="border-t border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="mx-auto max-w-5xl px-4 py-16 md:px-6">
          <SectionHeading
            eyebrow="Hol keresünk"
            title="A magyar listák a fókusz, de nem állunk meg a határnál"
            subtitle="A zenédet máshol is játsszák, és a pénzed ott is keletkezik. Mi ott is megnézzük, ahova te reálisan sosem jutnál el."
          />
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {SOURCE_GROUPS.map((group) => (
              <div key={group.region}>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{group.flag}</span>
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">
                    {group.region}
                  </h3>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <span
                      key={item}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]"
                    >
                      <Building2 className="h-3 w-3 text-[var(--text-muted)]" />
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <SectionHeading eyebrow="GYIK" title="Gyakori kérdések" />
        <div className="mt-8 divide-y divide-[var(--border)] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]">
          {FAQ.map((item) => (
            <details key={item.q} className="group px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-semibold text-[var(--text-primary)]">
                {item.q}
                <span className="ml-4 text-[var(--text-muted)] transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="pb-4 text-sm leading-relaxed text-[var(--text-secondary)]">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-[var(--border)]">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center md:px-6">
          <h2 className="text-balance text-3xl font-bold tracking-tight text-[var(--text-primary)] md:text-4xl">
            Hozzuk haza együtt a pénzed.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[var(--text-secondary)]">
            Egy név, egy keresés. Megmutatjuk, mi vár rád, és segítünk visszaszerezni. Ingyenes,
            kötelezettség nélkül.
          </p>
          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className="cta-grad mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-[10px] px-7 font-semibold text-white transition hover:brightness-105"
          >
            Ingyenes ellenőrzés <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[var(--border)] bg-[var(--bg-primary)]">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-[var(--text-muted)] md:flex-row md:px-6">
          <p>Jogdíj-visszaszerzés előadóknak és szerzőknek.</p>
          <div className="flex items-center gap-5">
            <Link href="/adatvedelem" className="hover:text-[var(--text-secondary)]">
              Adatkezelés
            </Link>
            <span>© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--accent-primary)]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-balance text-2xl font-bold tracking-tight text-[var(--text-primary)] md:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-pretty text-[var(--text-secondary)]">{subtitle}</p>
      )}
    </div>
  );
}

interface VerdictTeaserProps {
  phase: Phase;
  status: SearchStatus;
  groups: LandingTeaserGroup[];
  summary: { totalItems: number; societies: number; countries: number };
  resolvedName: string;
  email: string;
  emailSent: boolean;
  emailSending: boolean;
  emailError: string | null;
  onEmailChange: (v: string) => void;
  onEmailSubmit: (e: FormEvent) => void;
}

function VerdictTeaser(props: VerdictTeaserProps) {
  const { phase, status, groups, summary, resolvedName } = props;

  if (phase === "loading") {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-8 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--accent-primary)]" />
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Magyar és európai listákat nézem <strong>{resolvedName}</strong> névre…
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Az EJI és a külföldi jogkezelők élő lekérdezése akár egy percig is eltarthat.
        </p>
      </div>
    );
  }

  if (status !== "found" || groups.length === 0) {
    return <NoHitTeaser {...props} />;
  }

  return (
    <div className="glow-grad overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--accent-primary)_28%,var(--border))] bg-[var(--bg-primary)]">
      {/* verdict header */}
      <div className="border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--accent-primary)_9%,var(--bg-primary))] px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="grad-fill flex h-7 w-7 items-center justify-center rounded-full text-white">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
            Valószínű találat
          </span>
        </div>
        <p className="mt-3 text-lg font-semibold text-[var(--text-primary)]">
          A(z) <span className="text-[var(--accent-primary)]">{resolvedName}</span> névhez több
          azonosítatlan tételt találtunk.
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Az alábbi forrásokon szerepel a neved. A teljes listát és a visszaszerzés lépéseit az
          ingyenes összefoglalóban küldjük.
        </p>
      </div>

      {/* global summary */}
      <div className="grid grid-cols-3 divide-x divide-[var(--border)] border-b border-[var(--border)]">
        <SummaryStat value={summary.totalItems} label="tétel" />
        <SummaryStat value={summary.societies} label="jogkezelő" />
        <SummaryStat value={summary.countries} label="ország" />
      </div>

      {/* per-society groups */}
      <div className="space-y-4 px-6 py-5">
        {groups.map((group) => (
          <SourceGroup key={group.key} group={group} />
        ))}
        <p className="text-xs text-[var(--text-secondary)]">
          Jellemzően metaadat / IPI kérdés, amit ki tudunk bogozni és rendezni helyetted.
        </p>
      </div>

      <EmailGate {...props} />
    </div>
  );
}

/** Shown when the public search returns nothing, the engine is offline, or it errors. */
function NoHitTeaser(props: VerdictTeaserProps) {
  const { status, resolvedName } = props;

  const copy =
    status === "unavailable"
      ? {
          title: "A nyilvános kereső most nem elérhető",
          body: "A keresőmotor épp nem fut ezen a környezeten. Add meg az e-mailed, és kézzel nézzük át a magyar és külföldi listákat a nevedre.",
        }
      : status === "error"
        ? {
            title: "Hiba történt a keresés közben",
            body: "Valami félrement a lekérdezésnél. Add meg az e-mailed, és kézzel nézünk utána, vagy próbáld újra kicsit később.",
          }
        : {
            title: "Nincs egyértelmű nyilvános találat",
            body: "A nyilvános listákon most nem találtunk egyértelmű tételt erre a névre. Ez nem jelenti, hogy nincs kint pénzed: sok jogdíj nem nyilvános listán ül. Add meg az e-mailed, és mélyebben utánanézünk.",
          };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]">
      <div className="border-b border-[var(--border)] px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
            <SearchX className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {copy.title}
          </span>
        </div>
        <p className="mt-3 text-base font-semibold text-[var(--text-primary)]">
          <span className="text-[var(--accent-primary)]">{resolvedName}</span>
        </p>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{copy.body}</p>
      </div>
      <EmailGate {...props} />
    </div>
  );
}

function EmailGate({
  resolvedName,
  email,
  emailSent,
  emailSending,
  emailError,
  onEmailChange,
  onEmailSubmit,
}: VerdictTeaserProps) {
  return (
    <div className="border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--accent-primary)_5%,var(--bg-primary))] px-6 py-5">
      {emailSent ? (
        <div className="flex items-center gap-3">
          <span className="grad-fill flex h-9 w-9 items-center justify-center rounded-full text-white">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Köszönjük! Hamarosan jelentkezünk.
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              A(z) {resolvedName} névre vonatkozó összefoglalót erre az e-mailre küldjük.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[var(--accent-primary)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              Megmutatjuk a teljes listát, és segítünk hazahozni a pénzed.
            </p>
          </div>
          <form onSubmit={onEmailSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="E-mail cím"
              className="input-bbox h-11 flex-1 px-3"
              aria-label="E-mail cím"
            />
            <button
              type="submit"
              disabled={emailSending}
              className="cta-grad inline-flex h-11 items-center justify-center gap-2 rounded-[10px] px-5 font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {emailSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Kérem az összefoglalót"
              )}
            </button>
          </form>
          {emailError && (
            <p className="mt-2 text-xs font-medium text-[var(--accent-critical)]">{emailError}</p>
          )}
          <p className="mt-2 text-xs text-[var(--text-muted)]">
            Nem spam-elünk. Csak az összefoglalót küldjük, és bármikor leiratkozhatsz. Részletek az{" "}
            <Link href="/adatvedelem" className="underline hover:text-[var(--text-secondary)]">
              adatkezelési tájékoztatóban
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

function SummaryStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-4 py-4 text-center">
      <div className="text-2xl font-bold tracking-tight text-grad">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

const GHOST_PLACEHOLDERS: LandingTeaserHit[] = [
  { title: "Azonosítatlan tétel" },
  { title: "Azonosítatlan tétel" },
];

function SourceGroup({ group }: { group: LandingTeaserGroup }) {
  const isFuzzy = group.confidence === "fuzzy";
  const visibleHits = isFuzzy ? [] : group.hits;
  const remaining = group.total - visibleHits.length;
  const ghostCount = Math.min(2, Math.max(remaining, 0));
  const ghostHits =
    visibleHits.length > 0
      ? group.hits.slice(0, ghostCount)
      : GHOST_PLACEHOLDERS.slice(0, ghostCount);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
      {/* group header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base">{group.flag}</span>
          <span className="text-sm font-semibold text-[var(--text-primary)]">{group.source}</span>
          <span className="text-xs text-[var(--text-muted)]">{group.region}</span>
          {isFuzzy ? (
            <span className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
              névegyezés, ellenőrzendő
            </span>
          ) : null}
        </div>
        <span className="rounded-full border border-[color-mix(in_srgb,var(--accent-primary)_30%,var(--border))] bg-[color-mix(in_srgb,var(--accent-primary)_8%,transparent)] px-2 py-0.5 text-[11px] font-semibold text-[var(--text-primary)]">
          {visibleHits.length === 0
            ? `${group.total} tétel`
            : remaining > 0
              ? `Top ${visibleHits.length} a ${group.total}-ből`
              : `Mind a ${group.total}`}
        </span>
      </div>

      {/* hits */}
      <div className="mt-3 space-y-1.5">
        {visibleHits.map((hit, i) => (
          <HitRow key={`${group.key}-${i}-${hit.title}`} hit={hit} />
        ))}
        {remaining > 0 && ghostHits.length > 0 && (
          <div className="relative">
            <div aria-hidden className="space-y-1.5 select-none blur-[5px]">
              {ghostHits.map((hit, i) => (
                <HitRow key={`ghost-${group.key}-${i}`} hit={hit} />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1 text-xs font-medium text-[var(--text-secondary)] shadow-sm">
                <Lock className="h-3 w-3 text-[var(--accent-primary)]" />
                +{remaining} további
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HitRow({ hit }: { hit: LandingTeaserHit }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Music4 className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" />
      <span className="truncate text-[var(--text-secondary)]">{hit.title}</span>
      {(hit.type || hit.year) && (
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {hit.type ? (
            <span className="rounded bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">
              {hit.type}
            </span>
          ) : null}
          {hit.year ? (
            <span className="text-[10px] text-[var(--text-muted)]">{hit.year}</span>
          ) : null}
        </span>
      )}
    </div>
  );
}
