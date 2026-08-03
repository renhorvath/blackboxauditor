"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Loader2,
  Lock,
  Menu,
  Music4,
  Search,
  SearchX,
  X,
} from "lucide-react";
import type {
  LandingTeaserGroup,
  LandingTeaserHit,
  LandingTeaserResult,
} from "@/lib/landing-teaser";

/** Contact / post-check CTA — active, time-boxed, not "kérek egy…". */
const CTA_LABEL = "Egyeztessünk 20 percben";
const HERO_PRIMARY_LABEL = "Megnézem, szerepelek-e";
const HERO_SECONDARY_LABEL = "Inkább egyeztessünk";

const OCCUPATIONS = [
  "Filmzene",
  "Reklámzene",
  "Mindkettő",
  "Előadó",
  "Katalógus, kiadó",
  "Egyéb",
] as const;

const TRUST_LOGOS = ["ARTISJUS", "EJI", "GVL", "STIM", "SENA", "SOZA"] as const;

const CHAIN_BREAKS = [
  {
    title: "A zenefelállítás",
    text: "Ha a gyártó hiányosan vagy egyáltalán nem adja le, a felhasználás után nincs mihez kötni a kifizetést.",
  },
  {
    title: "A reklám más néven fut",
    text: "Márka és kampány szerint tartják nyilván, nem szerző szerint. A legtöbb reklámzeneszerző soha nem jelzi, mert nem tudja, hogy kellene.",
  },
  {
    title: "A disztribúciónál elvész a műazonosító",
    text: "Csak a felvétel azonosítója utazik tovább, a szerzeményé nem. A kettőt utólag kell összekötni.",
  },
  {
    title: "Külföldön más a cím",
    text: "Ha nincs meg a kapcsolat a címváltozatok között, a külföldi felhasználás nem talál haza.",
  },
  {
    title: "Két képviselet ugyanarra a műre",
    text: "Ütközésnél a rendszerek megállítják a kifizetést. Nem hiányzik az adat, csak ütközik.",
  },
] as const;

const STEPS = [
  { title: "Lelet", text: "Ingyenes átnézés: mi van a listákon, mi hiányzik, mi hozható vissza." },
  {
    title: "Megállapodás",
    text: "Zeneműkiadói megbízás és meghatalmazás, ennek alapján járunk el a nevedben. A szerzői jogaid a tieid maradnak, a keret megújuló.",
  },
  { title: "Igényérvényesítés", text: "Hiánybejelentések a jogkezelőknél, tételesen dokumentálva." },
  { title: "Folyamatos kezelés", text: "Hogy a következő felhasználásoknál már ne keletkezzen hiány." },
] as const;

const NOT_US = [
  { lead: "Nem vesszük meg a katalógusodat.", rest: "A jogaid nálad maradnak." },
  { lead: "Nem kötünk hosszú kizárólagos szerződést.", rest: "Megújuló keret, nem örök elköteleződés." },
  { lead: "Nem kerüljük meg a jogkezelőket.", rest: "A saját rendszereikben dolgozunk." },
  {
    lead: "Nem adunk el szoftvert.",
    rest: "A munkát mi végezzük el, saját fejlesztésű eszközökkel, gyorsabban és pontosabban, mint a hagyományos kiadói adminisztráció.",
  },
] as const;

const PRICING_FAQ = [
  {
    title: "Miből számoljátok a 25%-ot?",
    text: "Abból, ami e nélkül nem érkezett volna meg. Nem a meglévő jogdíjadból veszünk el részt.",
  },
  {
    title: "Miért nem olcsóbb?",
    text: "Egy jogász előlegre és óradíjra dolgozik akkor is, ha nem jön be semmi. Egy kiadói szerződés tartós részesedést kér magából a műből. Mi csak abból, ami megérkezett, és csak addig, amíg dolgozunk.",
  },
  {
    title: "Mi történik, ha nem csinálok semmit?",
    text: "Ami a határidőkön belül nem talál gazdára, az nem marad ott. A választás nem 100% és 75% között van, hanem 75% és 0% között.",
  },
  {
    title: "Miért 15 és nem 20 a kezelés?",
    text: "A 15% azoknak szól, akiknél visszaszerzéssel kezdtük. Önálló kezelési megbízásnál 20%.",
  },
  {
    title: "Ki tudok szállni?",
    text: "Bármikor, 90 napra, indoklás nélkül. Egy kivétel: a már benyújtott igényekre a beérkezésükig jár a jutalék, mert azt a munkát elvégeztük. Új igényt utána nem nyújtunk be.",
  },
  {
    title: "Van már kiadóm. Akkor is?",
    text: "Sokszor éppen ezért. Ha két képviselet fedi ugyanazt a művet, a rendszerek megállítják a kifizetést. Szűkített meghatalmazással is tudunk dolgozni, csak azokra a művekre, ahol a meglévő partnered nem jár el.",
  },
] as const;

type SearchPhase = "idle" | "loading" | "result";
type SearchStatus = LandingTeaserResult["status"] | "error";

const EMPTY_SUMMARY = { totalItems: 0, societies: 0, countries: 0 };
const MAX_GROUPS = 3;

const HEADER_NAV = [
  { href: "#ellenorzes", label: "Ellenőrzés" },
  { href: "#hogyan", label: "Hogyan dolgozunk" },
  { href: "#dijazas", label: "Díjazás" },
] as const;

function MederMotif({
  variant = "white",
  size = "display",
  className = "",
}: {
  variant?: "white" | "ink";
  /** display = section ornament; mark = wordmark lockup */
  size?: "display" | "mark";
  className?: string;
}) {
  const src =
    variant === "ink" ? "/meder-motif-ink.webp" : "/meder-motif-white.webp";
  const box =
    size === "mark"
      ? "h-6 w-9 shrink-0"
      : "h-14 w-20 md:h-16 md:w-24";
  return (
    <div className={`relative ${box} ${className}`} aria-hidden>
      <Image
        src={src}
        alt=""
        fill
        sizes={size === "mark" ? "36px" : "96px"}
        className="object-contain object-left"
      />
    </div>
  );
}

export function MederLanding() {
  const [query, setQuery] = useState("");
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle");
  const [resolvedName, setResolvedName] = useState("");
  const [groups, setGroups] = useState<LandingTeaserGroup[]>([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("none");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.removeItem("bbox-theme");
    } catch {
      /* ignore */
    }
  }, []);

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2 || searchPhase === "loading") return;
    setResolvedName(trimmed);
    setSearchPhase("loading");
    setGroups([]);
    setSummary(EMPTY_SUMMARY);
    try {
      const res = await fetch("/api/landing-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistName: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as LandingTeaserResult | null;
      if (!res.ok || !data) {
        setSearchStatus("error");
      } else {
        setGroups(data.groups);
        setSummary(data.summary);
        setSearchStatus(data.status);
        if (!name.trim()) setName(trimmed);
      }
    } catch {
      setSearchStatus("error");
    } finally {
      setSearchPhase("result");
    }
  }

  function fillContactName() {
    if (resolvedName && !name.trim()) setName(resolvedName);
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function goToContact() {
    fillContactName();
    closeMenu();
    document.getElementById("kapcsolat")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setFormError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          phone: phone.trim() || undefined,
          occupation,
          message: message.trim() || undefined,
          searchedName: resolvedName || undefined,
          source: "meder-contact",
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "Küldés sikertelen.");
      setSent(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Küldés sikertelen.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="meder-page">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
          <Link
            href="/"
            className="meder-display inline-flex items-center gap-2 text-xl normal-case tracking-tight"
            onClick={closeMenu}
          >
            <MederMotif variant="ink" size="mark" />
            meder.
          </Link>
          <nav className="hidden items-center gap-5 md:flex" aria-label="Oldal navigáció">
            {HEADER_NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-xs font-bold tracking-[0.08em] uppercase text-black/60 hover:text-black"
              >
                {item.label}
              </a>
            ))}
            <a
              href="#kapcsolat"
              onClick={fillContactName}
              className="meder-cta py-2.5"
            >
              Beszéljünk
            </a>
          </nav>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center text-black md:hidden"
            aria-expanded={menuOpen}
            aria-controls="meder-mobile-nav"
            aria-label={menuOpen ? "Menü bezárása" : "Menü megnyitása"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" strokeWidth={2} /> : <Menu className="h-5 w-5" strokeWidth={2} />}
          </button>
        </div>
        {menuOpen ? (
          <nav
            id="meder-mobile-nav"
            className="border-t border-black/10 bg-white md:hidden"
            aria-label="Mobil navigáció"
          >
            <div className="mx-auto flex max-w-6xl flex-col px-4 py-3">
              {HEADER_NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="border-b border-black/10 py-3.5 text-xs font-bold tracking-[0.08em] uppercase text-black/70"
                >
                  {item.label}
                </a>
              ))}
              <a
                href="#kapcsolat"
                onClick={() => {
                  fillContactName();
                  closeMenu();
                }}
                className="meder-cta mt-4 mb-2 flex h-11 items-center justify-center"
              >
                Beszéljünk
              </a>
            </div>
          </nav>
        ) : null}
      </header>

      {/* 1. Hero — flat petrol block, no photo */}
      <section className="relative overflow-hidden bg-[var(--meder-petrol)] text-white">
        <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 md:px-6 md:pb-24 md:pt-20">
          <p className="meder-label text-white/55">(Film- és reklámzeneszerzőknek, előadóknak, katalógusoknak)</p>
          <h1 className="meder-display mt-6 max-w-4xl text-[2.4rem] md:text-[4.25rem]">
            A jogdíj nem érkezik meg magától.
          </h1>
          <p className="mt-6 max-w-xl text-base font-normal leading-relaxed text-white/70 md:text-lg">
            A jogdíjrendszer sok szereplős és bonyolult. A terjesztőtől vagy a filmgyártótól a
            jogkezelőig hosszú a lánc, és ha egyetlen adat hiányzik, a pénz megáll, sokszor úgy,
            hogy észre sem veszed. Mi összekötjük a szálakat: kimentjük, ami beragadt, és rendben
            tartjuk.
          </p>
          <div className="mt-10 flex flex-col items-start gap-4">
            <a href="#ellenorzes" className="meder-cta meder-cta-light">
              {HERO_PRIMARY_LABEL}
            </a>
            <a
              href="#kapcsolat"
              onClick={fillContactName}
              className="text-sm font-medium text-white/70 underline-offset-4 transition hover:text-white hover:underline"
            >
              {HERO_SECONDARY_LABEL} →
            </a>
          </div>
          <p className="mt-6 text-[11px] font-medium tracking-[0.12em] text-white/45 uppercase">
            Nincs előleg · A jogaid nálad maradnak · Tételes elszámolás
          </p>
          <div className="mt-14">
            <MederMotif variant="white" />
          </div>
        </div>
      </section>

      {/* Trust */}
      <div className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-5 md:px-6">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {TRUST_LOGOS.map((s) => (
              <span key={s} className="text-[11px] font-bold tracking-[0.14em] text-black/35 uppercase">
                {s}
              </span>
            ))}
          </div>
          <span className="text-[11px] font-bold tracking-[0.1em] text-black/55 uppercase">
            15+ jogkezelő · 10+ ország
          </span>
        </div>
      </div>

      {/* 2. Előzetes ellenőrzés */}
      <section id="ellenorzes" className="scroll-mt-16 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:gap-16">
            <div>
              <p className="meder-label">(Előzetes ellenőrzés)</p>
              <h2 className="meder-display mt-4 text-3xl md:text-5xl">
                Szerepelsz a kifizetetlen listákon?
              </h2>
              <p className="mt-5 text-sm leading-relaxed text-black/55 md:text-base">
                Írd be az előadóneved, és megnézzük a jogkezelők nyilvános, azonosítatlan
                tétel-listáit. Ez nem a teljes vizsgálat: a reklámkampányok lejelentései például nem
                nyilvánosak, azokat a teljes átnézésben kérjük le.
              </p>
            </div>
            <form onSubmit={runSearch} className="flex flex-col justify-end gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-black/35" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Előadóneved a kiadványokon"
                  className="meder-input h-12 pl-10!"
                  aria-label="Előadónév"
                  minLength={2}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={searchPhase === "loading"}
                className="meder-cta inline-flex h-12 items-center justify-center gap-2 disabled:opacity-50"
              >
                {searchPhase === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ellenőrzés"}
              </button>
            </form>
          </div>

          {searchPhase !== "idle" && (
            <div className="mt-10">
              <MederVerdict
                phase={searchPhase}
                status={searchStatus}
                groups={groups}
                summary={summary}
                resolvedName={resolvedName}
                onPrimaryCta={goToContact}
              />
            </div>
          )}
        </div>
      </section>

      {/* 3. Hol szakad el — line accordion */}
      <section className="border-t border-black/10 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <p className="meder-label">(Hol szakad el a lánc)</p>
          <h2 className="meder-display mt-4 max-w-3xl text-3xl md:text-5xl">
            Hol szokott elakadni a pénz
          </h2>
          <p className="mt-4 max-w-xl text-sm text-black/55 md:text-base">
            Nem egy hiba van, hanem sokféle. Ezek a leggyakoribbak.
          </p>
          <div className="mt-10 border-t border-black/15">
            {CHAIN_BREAKS.map((item) => (
              <details key={item.title} className="group border-b border-black/15">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5">
                  <span className="meder-display text-base md:text-xl">{item.title}</span>
                  <span className="text-lg text-black/40 transition group-open:rotate-45">+</span>
                </summary>
                <p className="pb-5 pr-10 text-sm leading-relaxed text-black/55">{item.text}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-black/60">
            A jogkezelők ugyanazt akarják, amit te: hogy a pénz megtalálja a gazdáját. A hiányzó
            láncszem az adat. Mi ezt állítjuk elő, a te nevedben.
          </p>
        </div>
      </section>

      {/* 4. Split — photo | hogyan dolgozunk */}
      <section id="hogyan" className="scroll-mt-16 grid md:grid-cols-2">
        <div className="relative min-h-[320px] bg-[var(--meder-sand)] md:min-h-[520px]">
          <Image
            src="/hero.webp"
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover object-center opacity-90"
          />
          <div className="absolute bottom-6 left-6">
            <MederMotif variant="white" className="drop-shadow-sm" />
          </div>
        </div>
        <div className="flex flex-col justify-center bg-[var(--meder-black)] px-6 py-14 text-white md:px-12 md:py-20">
          <p className="meder-label text-white/45">(Hogyan dolgozunk)</p>
          <h2 className="meder-display mt-4 text-3xl md:text-4xl">A lelettől a folyamatos kezelésig</h2>
          <ul className="mt-10 space-y-6">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-t border-white/15 pt-5">
                <p className="meder-display text-sm text-white">
                  <span className="text-white/40">{String(i + 1).padStart(2, "0")} · </span>
                  {step.title}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{step.text}</p>
              </li>
            ))}
          </ul>
          <a href="#kapcsolat" onClick={fillContactName} className="meder-link-plus mt-10 self-start text-white">
            Beszéljünk +
          </a>
        </div>
      </section>

      {/* 5. Mi nem vagyunk — before pricing, reduces price resistance */}
      <section className="bg-[var(--meder-black)] text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <p className="meder-label text-white/45">(Átlátható elvárások)</p>
          <h2 className="meder-display mt-4 text-3xl md:text-5xl">Mi nem vagyunk</h2>
          <ul className="mt-10 max-w-3xl space-y-5">
            {NOT_US.map((item) => (
              <li key={item.lead} className="border-t border-white/15 pt-5 text-base leading-relaxed text-white/65">
                <strong className="meder-display block text-sm text-white md:text-base">{item.lead}</strong>
                <span className="mt-1 block text-sm">{item.rest}</span>
              </li>
            ))}
          </ul>
          <div className="mt-14 border-t border-white/15 pt-10">
            <h3 className="meder-display text-2xl md:text-3xl">Miért nem érdemes halogatni</h3>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/55 md:text-base">
              Az igényérvényesítésnek időbeli korlátai vannak. Ami kicsúszik belőlük, az véglegesen
              máshova kerül. Minél korábban kezdjük, annál kevesebb vész el.
            </p>
            <a
              href="#kapcsolat"
              onClick={fillContactName}
              className="meder-cta meder-cta-light mt-8"
            >
              {CTA_LABEL}
            </a>
          </div>
        </div>
      </section>

      {/* 6. Árazás */}
      <section id="dijazas" className="scroll-mt-16 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <p className="meder-label">(Árazás)</p>
          <h2 className="meder-display mt-4 text-3xl md:text-5xl">Mennyibe kerül</h2>
          <div className="mt-12 grid gap-0 border-t border-black/15 md:grid-cols-2">
            <div className="border-b border-black/15 py-8 md:border-r md:border-b-0 md:pr-12 md:py-10">
              <p className="meder-display text-xl md:text-2xl">Visszaszerzés · 25%</p>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-black/55">
                A ténylegesen megérkezett összegből. Nincs előleg. Ha nem érkezik pénz, nem fizetsz.
              </p>
            </div>
            <div className="py-8 md:py-10 md:pl-12">
              <p className="meder-display text-xl md:text-2xl">Folyamatos kezelés · 15%</p>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-black/55">
                A kezelt jogdíjfolyamból. Nincs havidíj, nincs kiadói részesedés a műveidből.
              </p>
            </div>
          </div>
          <p className="mt-10 max-w-2xl text-sm leading-relaxed text-black/55">
            Kis tételre nem számlázunk. A legjobb eredményünk az, ha egy év múlva nincs mit
            visszaszerezni.
          </p>
          <p className="mt-8 text-[11px] font-medium tracking-[0.06em] text-black/40 uppercase">
            Megújuló keret · Felmondás 90 napra · A jogaid nálad maradnak ·{" "}
            <a
              href="#dijazas-reszletek"
              className="text-black/55 underline underline-offset-4 transition hover:text-black"
            >
              Részletek +
            </a>
          </p>
          <div id="dijazas-reszletek" className="mt-10 scroll-mt-16 border-t border-black/15">
            {PRICING_FAQ.map((item) => (
              <details key={item.title} className="group border-b border-black/15">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5">
                  <span className="meder-display text-base md:text-xl">{item.title}</span>
                  <span className="text-lg text-black/40 transition group-open:rotate-45">+</span>
                </summary>
                <p className="pb-5 pr-10 text-sm leading-relaxed text-black/55">{item.text}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Kik vagyunk */}
      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-20">
          <p className="meder-label">(Kik vagyunk)</p>
          <h2 className="meder-display mt-4 text-3xl md:text-5xl">A Meder</h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-4 border-t border-black/15 pt-6">
                <div
                  className="flex h-20 w-20 shrink-0 items-center justify-center bg-[var(--meder-sand)] text-[10px] font-bold tracking-wider text-black/35 uppercase"
                  aria-hidden
                >
                  Fotó
                </div>
                <div>
                  <p className="meder-display text-base">Név</p>
                  <p className="mt-2 text-sm leading-relaxed text-black/55">
                    Egy mondat a szerepről és a szakmai háttérről.
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-12 max-w-2xl text-sm leading-relaxed text-black/60 md:text-base">
            A Meder jogdíj-visszaszerzéssel és kiadói adminisztrációval foglalkozik film- és
            reklámzeneszerzők, előadók és kisebb katalógusok számára. A jogkezelők saját
            rendszereiben dolgozunk, meghatalmazás alapján.
          </p>
          <p className="mt-8 max-w-xl font-[family-name:var(--font-meder-sans)] text-xl leading-snug font-medium tracking-tight md:text-2xl">
            A jogdíjnak van egy medre. Mi visszatereljük bele, és benne is tartjuk.
          </p>
        </div>
      </section>

      {/* 8. Kapcsolat — petrol block */}
      <section id="kapcsolat" className="scroll-mt-16 bg-[var(--meder-petrol)] text-white">
        <div className="mx-auto max-w-xl px-4 py-16 md:px-6 md:py-20">
          <p className="meder-label text-white/50">(Kapcsolat)</p>
          <h2 className="meder-display mt-4 text-3xl md:text-5xl">Beszéljünk</h2>
          <p className="mt-4 text-sm text-white/60 md:text-base">
            Húsz perc alatt kiderül, van-e mit keresni nálad. Ha nincs, azt is megmondjuk.
          </p>

          {sent ? (
            <p className="mt-10 border border-white/25 px-5 py-6 text-sm font-medium">
              Megkaptuk. Két munkanapon belül jelentkezünk.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-10 space-y-4">
              <div>
                <label htmlFor="meder-name" className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-white/55">
                  Név
                </label>
                <input
                  id="meder-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="meder-input-on-color"
                />
              </div>
              <div>
                <label htmlFor="meder-email" className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-white/55">
                  E-mail
                </label>
                <input
                  id="meder-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="meder-input-on-color"
                />
              </div>
              <div>
                <label htmlFor="meder-phone" className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-white/55">
                  Telefon <span className="font-normal normal-case tracking-normal">(opcionális)</span>
                </label>
                <input
                  id="meder-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ha hívást kérsz"
                  className="meder-input-on-color"
                />
              </div>
              <div>
                <label htmlFor="meder-occ" className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-white/55">
                  Mivel foglalkozol
                </label>
                <select
                  id="meder-occ"
                  required
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  className="meder-input-on-color"
                >
                  <option value="" disabled>
                    Válassz…
                  </option>
                  {OCCUPATIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="meder-msg" className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-white/55">
                  Miről van szó <span className="font-normal normal-case tracking-normal">(opcionális)</span>
                </label>
                <textarea
                  id="meder-msg"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Pár mondat: milyen filmekhez, reklámokhoz írtál zenét, vagy mi nem stimmel."
                  className="meder-input-on-color resize-y"
                />
              </div>
              {formError ? <p className="text-sm font-medium text-[#f0c4a0]">{formError}</p> : null}
              <button
                type="submit"
                disabled={sending}
                className="meder-cta meder-cta-light inline-flex h-12 w-full items-center justify-center gap-2 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Elküldöm"}
              </button>
              <p className="text-xs text-white/40">
                Az adataidat kizárólag a megkeresésed megválaszolására használjuk.{" "}
                <Link href="/adatvedelem" className="underline hover:text-white/70">
                  Adatkezelés
                </Link>
              </p>
            </form>
          )}
          <div className="mt-12">
            <MederMotif variant="white" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/10 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 md:flex-row md:items-end md:justify-between md:px-6">
          <div>
            <p className="meder-display inline-flex items-center gap-2 text-lg normal-case tracking-tight">
              <MederMotif variant="ink" size="mark" />
              meder.
            </p>
            <p className="mt-2 text-xs tracking-wide text-black/45 uppercase">
              hello@meder.hu · Cégadatok hamarosan
            </p>
          </div>
          <div className="flex flex-wrap gap-5 text-[11px] font-bold tracking-[0.1em] uppercase text-black/45">
            <Link href="/adatvedelem" className="hover:text-black">
              Adatkezelés
            </Link>
          </div>
        </div>
        <div className="mx-auto max-w-6xl border-t border-black/10 px-4 py-4 md:px-6">
          <p className="text-xs text-black/40">
            A magyar és külföldi jogkezelőkkel együttműködve dolgozunk.
          </p>
        </div>
      </footer>

      {/* Mobile sticky */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white p-3 md:hidden">
        <a
          href="#kapcsolat"
          onClick={fillContactName}
          className="meder-cta flex h-11 w-full items-center justify-center"
        >
          {CTA_LABEL}
        </a>
      </div>
      <div className="h-16 md:hidden" aria-hidden />
    </div>
  );
}

/* ——— Gated search teaser ——— */

function MederVerdict({
  phase,
  status,
  groups,
  summary,
  resolvedName,
  onPrimaryCta,
}: {
  phase: SearchPhase;
  status: SearchStatus;
  groups: LandingTeaserGroup[];
  summary: { totalItems: number; societies: number; countries: number };
  resolvedName: string;
  onPrimaryCta: () => void;
}) {
  if (phase === "loading") {
    return (
      <div className="border border-black/15 px-6 py-10 text-center">
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-black/40" />
        <p className="mt-3 text-sm text-black/55">
          Magyar és európai listákat nézem <strong>{resolvedName}</strong> névre…
        </p>
        <p className="mt-2 text-xs text-black/40">
          Néhány forrás (pl. EJI) lassabb lehet — akár 30–40 másodperc. Várj, dolgozunk.
        </p>
      </div>
    );
  }

  const visibleGroups = groups.slice(0, MAX_GROUPS);
  const hiddenCount = Math.max(0, groups.length - MAX_GROUPS);
  const found = status === "found" && groups.length > 0;

  if (!found) {
    const copy =
      status === "unavailable"
        ? {
            title: "A nyilvános kereső most nem elérhető",
            body: "Add meg a kapcsolati adataidat, és kézzel nézzük át a listákat.",
          }
        : status === "error"
          ? {
              title: "Hiba történt a keresés közben",
              body: "Próbáld újra, vagy írj nekünk, utánanézünk.",
            }
          : {
              title: "Nincs egyértelmű nyilvános találat",
              body: "Ez nem jelenti, hogy nincs kint pénzed. Beszéljünk, és mélyebben utánanézünk.",
            };

    return (
      <div className="border border-black/15">
        <div className="px-6 py-6">
          <div className="flex items-center gap-2">
            <SearchX className="h-4 w-4 text-black/35" />
            <span className="meder-label">{copy.title}</span>
          </div>
          <p className="meder-display mt-4 text-xl">{resolvedName}</p>
          <p className="mt-2 text-sm text-black/55">{copy.body}</p>
          <button type="button" onClick={onPrimaryCta} className="meder-cta mt-6">
            {CTA_LABEL}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-black/15">
      <div className="border-b border-black/15 px-6 py-5">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-[var(--meder-petrol)]" />
          <span className="meder-label text-[var(--meder-petrol)]">(Valószínű találat)</span>
        </div>
        <p className="meder-display mt-3 text-xl md:text-2xl">
          {resolvedName} · azonosítatlan tételek
        </p>
        <p className="mt-2 text-sm text-black/50">
          A teljes lista és a visszaszerzés a beszélgetés után jön.
        </p>
      </div>

      <div className="grid grid-cols-3 divide-x divide-black/10 border-b border-black/15">
        {[
          { value: summary.totalItems, label: "tétel" },
          { value: summary.societies, label: "jogkezelő" },
          { value: summary.countries, label: "ország" },
        ].map((s) => (
          <div key={s.label} className="px-4 py-4 text-center">
            <div className="meder-display text-2xl">{s.value}</div>
            <div className="mt-1 text-[10px] font-bold tracking-wider text-black/40 uppercase">
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 px-6 py-5">
        {visibleGroups.map((group) => (
          <MederSourceGroup key={group.key} group={group} />
        ))}
        {hiddenCount > 0 ? (
          <p className="text-xs text-black/45">+{hiddenCount} további forrás a teljes átnézésben.</p>
        ) : null}
      </div>

      <div className="border-t border-black/15 bg-[var(--meder-sand)]/40 px-6 py-5">
        <button type="button" onClick={onPrimaryCta} className="meder-cta">
          {CTA_LABEL}
        </button>
        <p className="mt-3 text-xs text-black/45">Nincs kötelezettség. Átbeszéljük a következő lépést.</p>
      </div>
    </div>
  );
}

const GHOSTS: LandingTeaserHit[] = [
  { title: "Azonosítatlan tétel" },
  { title: "Azonosítatlan tétel" },
];

function MederSourceGroup({ group }: { group: LandingTeaserGroup }) {
  const isFuzzy = group.confidence === "fuzzy";
  const visibleHits = isFuzzy ? [] : group.hits;
  const remaining = group.total - visibleHits.length;
  const ghostCount = Math.min(2, Math.max(remaining, 0));
  const ghostHits =
    visibleHits.length > 0 ? group.hits.slice(0, ghostCount) : GHOSTS.slice(0, ghostCount);

  return (
    <div className="border border-black/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span>{group.flag}</span>
          <span className="text-sm font-bold tracking-wide uppercase">{group.source}</span>
          <span className="text-xs text-black/40">{group.region}</span>
          {isFuzzy ? (
            <span className="text-[10px] font-bold tracking-wider text-black/35 uppercase">
              névegyezés
            </span>
          ) : null}
        </div>
        <span className="text-[10px] font-bold tracking-wider text-black/45 uppercase">
          {visibleHits.length === 0
            ? `${group.total} tétel`
            : remaining > 0
              ? `Top ${visibleHits.length} / ${group.total}`
              : `Mind a ${group.total}`}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {visibleHits.map((hit, i) => (
          <MederHitRow key={`${group.key}-${i}`} hit={hit} />
        ))}
        {remaining > 0 && ghostHits.length > 0 ? (
          <div className="relative">
            <div aria-hidden className="space-y-1.5 select-none blur-[5px]">
              {ghostHits.map((hit, i) => (
                <MederHitRow key={`g-${group.key}-${i}`} hit={hit} />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 border border-black/10 bg-white px-3 py-1 text-[10px] font-bold tracking-wider uppercase text-black/55">
                <Lock className="h-3 w-3" />+{remaining} további
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MederHitRow({ hit }: { hit: LandingTeaserHit }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Music4 className="h-3.5 w-3.5 shrink-0 text-black/30" />
      <span className="truncate text-black/65">{hit.title}</span>
      {(hit.type || hit.year) && (
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[10px] text-black/35">
          {hit.type ? <span>{hit.type}</span> : null}
          {hit.year ? <span>{hit.year}</span> : null}
        </span>
      )}
    </div>
  );
}
