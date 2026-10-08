"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { ArrowRight, Loader2, Lock, Menu, Music4, Plus, Search, SearchX, X } from "lucide-react";
import {
  RIGHT_LABEL,
  type LandingRightType,
  type LandingTeaserGroup,
  type LandingTeaserHit,
  type LandingTeaserResult,
} from "@/lib/landing-teaser";

const CTA_LABEL = "Egyeztessünk 20 percben";

const HEADER_NAV = [
  { href: "#ellenorzes", label: "Ellenőrzés" },
  { href: "#kiknek", label: "Kiknek" },
  { href: "#hogyan", label: "Hogyan dolgozunk" },
  { href: "#dijazas", label: "Díjazás" },
  { href: "#rolunk", label: "Rólunk" },
] as const;

const HERO_STATS = [
  { value: "15+", label: "jogkezelő" },
  { value: "10+", label: "ország" },
  { value: "3M+", label: "figyelt tétel" },
] as const;

const CHAIN_BREAKS = [
  {
    title: "A zene átlépi a határt, az adat nem.",
    text: "Külföldön más címmel, ékezet nélkül vagy hiányos szerzői adattal jelentik le a dalt. A helyi jogkezelő nem tudja, kié.",
  },
  {
    title: "Ott hallgatnak, ahol nem is gondolnád.",
    text: "Az algoritmus a saját niche-edben más országokban is tol, a határon túli magyar rádiók játszanak. Ezekről a felhasználásokról sokszor maga az alkotó sem tud.",
  },
  {
    title: "Film és reklám: a legnehezebb terep.",
    text: "Ha a gyártó hiányosan adja le a zenefelállítást, vagy a reklám a márka és a kampány nevén fut, a felhasználás után nincs mihez kötni a kifizetést.",
  },
  {
    title: "A fellépésekről nem megy lejelentés.",
    text: "A saját dalaidat játszod itthon és turnén, de ha a műsorlista nem jut el a jogkezelőhöz, szerzői jogdíj sem keletkezik.",
  },
  {
    title: "Elvész az azonosító.",
    text: "A disztribúciónál csak a felvétel azonosítója utazik tovább, a szerzeményé nem. A kettőt utólag kell összekötni.",
  },
  {
    title: "Két képviselet ugyanarra a műre.",
    text: "Ütközésnél a rendszerek megállítják a kifizetést. Nem hiányzik az adat, csak ütközik.",
  },
] as const;

const AUDIENCES: { label: string; title: string; text: string; note?: string }[] = [
  {
    label: "Szerzőknek és előadóknak",
    title: "Ha írod, ha játszod, ha mindkettő.",
    text: "A szerzői és az előadói jogdíj két külön úton jár, két külön rendszerben. Mi egyszerre nézzük mindkettőt, itthon és külföldön, hogy egyik se maradjon el a másik miatt.",
  },
  {
    label: "Film és reklám",
    title: "Ahol a legtöbb pénz akad el.",
    text: "Filmnél és reklámnál a felhasználást gyakran fel kell kutatni: ki gyártotta, milyen néven jelentette le, hol és hányszor sugározták. Mindkét területen nagy tapasztalatunk van, és a reklamációt végigvisszük a kifizetésig.",
    note: "A reklámfelhasználás azonosításához a gyártói megrendelés vagy a produkciós szerződés kell.",
  },
  {
    label: "Zenekaroknak és turnézóknak",
    title: "Minden fellépés lejelentve.",
    text: "Ha a saját dalaitokat játsszátok, minden koncert után szerzői jogdíj jár, itthon és külföldön is, ha a műsorlista eljut a helyi jogkezelőhöz. A lejelentést automatizáljuk, hogy egy turnéállomás se maradjon ki.",
  },
  {
    label: "Kiadóknak, labeleknek, menedzsmenteknek",
    title: "A 360 fokos munka mellé.",
    text: "Egy kiadó vagy label ma sokszor menedzsmentként dolgozik: kiadás, marketing, koncert, sync. A jogdíjak behajtása ehhez képest külön szakma. Átvesszük a teljes rosterre, vagy csak azokra a művekre, ahol nálatok elakadt, és a fellépés-lejelentést is vihetjük. A meglévő kiadói szerződéseitekhez nem nyúlunk.",
  },
];

const WHY_US = [
  {
    title: "Regisztrált kiadóként, meghatalmazással.",
    text: "Zeneműkiadóként a szerzői, meghatalmazottként a szomszédos jogi jogkezelőknél járunk el. A reklamációt a saját rendszereikben adjuk be, nem kívülről kérjük.",
  },
  {
    title: "Saját eszközök.",
    text: "Saját fejlesztésű összevetés, azonosítás és nyomkövetés. Amit kézzel hetekig keresnénk, azt órák alatt végignézzük.",
  },
  {
    title: "Rálátás a hiányzó adatra.",
    text: "Évtizedek a zene, a film és a reklám között: tudjuk, ki gyárt, ki jelent le, és hol érdemes keresni.",
  },
  {
    title: "A zene nem áll meg a határon. Mi sem.",
    text: "Több mint 3 millió tételt figyelünk 15+ jogkezelőnél, 10+ országban, szerzői és szomszédos oldalon.",
  },
] as const;

const STEPS = [
  {
    title: "Lelet",
    text: "Ingyenes bevezető beszélgetés és átnézés: mi van a listákon, mi hiányzik, mi hozható vissza.",
  },
  {
    title: "Megbízás",
    text: "Zeneműkiadói megbízás és meghatalmazás. A jogaid a tieid maradnak, a keret megújuló.",
  },
  {
    title: "Felkutatás",
    text: "Reklamáció a jogkezelőknél, tételesen, itthon és külföldön. Filmnél és reklámnál gyakran nyomozással.",
  },
  {
    title: "Karbantartás",
    text: "Regisztráció, lejelentés, fellépések: hogy a következő felhasználásnál már ne keletkezzen hiány.",
  },
] as const;

const NOT_US = [
  { lead: "Nem kötünk hosszú kizárólagos szerződést.", rest: "Megújuló keret, nem örök elköteleződés." },
  { lead: "Nem lépünk a kiadód helyébe.", rest: "Mellette dolgozunk, ott, ahol a behajtás elakadt." },
  { lead: "Nem kerüljük meg a jogkezelőket.", rest: "A saját rendszereikben dolgozunk." },
  { lead: "Nem adunk el szoftvert.", rest: "A munkát mi végezzük el, saját eszközökkel." },
] as const;

const PRICES = [
  {
    name: "Bevezető beszélgetés",
    value: "0 Ft",
    text: "Húsz perc, és kiderül, van-e mit keresni nálad.",
  },
  {
    name: "Visszaszerzés",
    value: "25%",
    text: "A ténylegesen megérkezett összegből. Nincs előleg. Ha nem érkezik pénz, nem fizetsz.",
  },
  {
    name: "Folyamatos kezelés",
    value: "15%",
    text: "A kezelt jogdíjfolyamból. Nincs havidíj, nincs kiadói részesedés a műveidből.",
  },
] as const;

const PRICING_FAQ = [
  {
    title: "Szerző és előadó is vagyok. Két megbízás kell?",
    text: "Nem kell két helyre fordulnod: egy megbízásban kezeljük mindkét oldalt. A jogkezelők felé a szerzői és a szomszédos jogi oldalra külön meghatalmazás kell, ezeket mi készítjük elő.",
  },
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
    text: "Ami a határidőkön belül nem talál gazdára, az nem marad ott. Minél később kezded, annál több veszhet el végleg.",
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

const TEAM: {
  key: string;
  name: string;
  imageSrc: string | null;
  bio: string;
  links: { label: string; href: string }[];
}[] = [
  {
    key: "renato",
    name: "Horváth Renátó",
    imageSrc: "/team-renato.webp",
    bio: "Több mint 20 éve építek európai szintű kapcsolatokat és megoldásokat a zene, film és kreatív ipar között. A sync licensing és a rights management területén a jogdíjak útját teszem átláthatóvá: licencelés, jogtulajdonosi ellenőrzés és kifizetésre vezető dokumentáció. A Mederben ezt a tudást a jogdíj-recovery felé fordítjuk: a beragadt felhasználásokat oda tereljük vissza, ahol a megfelelő jogkezelőnél, tételesen és kifizetésig végigvihetően rendezhetők.",
    links: [
      { label: "renatohorvath.com", href: "https://renatohorvath.com/" },
      { label: "LinkedIn", href: "https://www.linkedin.com/in/renatohorvath/" },
    ],
  },
  {
    key: "zsofia",
    name: "Lehoczki Zsófia",
    imageSrc: "/team-zsofia.webp",
    bio: "Több mint egy évtizede dolgozom a szerzői jog területén: alkotókat és vállalkozásokat segítek abban, hogyan találják meg a jogi megoldásokat a kulturális és kreatív iparban. Oktatói tevékenységem mindig is meghatározó volt: előadásokat tartottam IP és szerzői jogi témákban joghallgatóknak, kutatóknak, közgazdászoknak és mérnököknek. Ügyvédként is dolgoztam, és a Szerzői Jogi Szakértők Tanácsának tagjaként is közreműködöm. Jelenleg a Copyright Agency alapítója és vezetője vagyok.",
    links: [{ label: "LinkedIn", href: "https://www.linkedin.com/in/lehoczkizsofia/" }],
  },
  {
    key: "tamas",
    name: "Szabó Tamás",
    imageSrc: "/team-tamas.webp",
    bio: "Zeneműkiadói adminisztrációval foglalkozom: szerződések, műregisztráció, elszámolás. A Central Publishingnél látom, mennyi munkával jár egy katalógus karbantartása, és hol csúszik ki belőle a pénz. A Mederben ezt a gyakorlatot viszem a behajtásba és a folyamatos kezelésbe.",
    links: [],
  },
];

const OCCUPATIONS = [
  "Szerző",
  "Előadó",
  "Szerző és előadó",
  "Zenekar",
  "Film- vagy reklámzene",
  "Kiadó, label, menedzsment",
  "Egyéb",
] as const;

type SearchPhase = "idle" | "loading" | "result";
type SearchStatus = LandingTeaserResult["status"] | "error";
type Summary = LandingTeaserResult["summary"];

const EMPTY_SUMMARY: Summary = { totalItems: 0, societies: 0, countries: 0, rights: [] };
const MAX_GROUPS = 4;

const RIGHT_SHORT: Record<LandingRightType, string> = {
  author: "szerzői",
  neighbouring: "szomszédos",
};

const SECTION = "mx-auto max-w-7xl px-5 md:px-8";

function RiverMotif({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`meder-motif inline-block aspect-[800/665] ${className}`} />;
}

/** Words light up as the paragraph scrolls through the viewport (BMAT-style). */
function RevealText({
  text,
  className = "",
  dark = false,
}: {
  text: string;
  className?: string;
  dark?: boolean;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const progress = reduced ? 1 : (vh * 0.85 - rect.top) / (rect.height + vh * 0.35);
      setLit(Math.round(Math.max(0, Math.min(1, progress)) * words.length));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    onScroll();
    if (reduced) return () => cancelAnimationFrame(frame);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [words.length]);

  const tone = dark
    ? ({
        "--meder-reveal-off": "rgba(244, 242, 236, 0.22)",
        "--meder-reveal-on": "var(--meder-paper)",
      } as CSSProperties)
    : undefined;

  return (
    <p ref={ref} className={className} style={tone}>
      {words.map((word, i) => (
        <span key={i} className={`meder-reveal-word${i < lit ? " is-on" : ""}`}>
          {word}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}

function Accordion({
  items,
  dark = false,
  numbered = false,
}: {
  items: readonly { title: string; text: string }[];
  dark?: boolean;
  numbered?: boolean;
}) {
  const line = dark ? "border-white/15" : "border-[var(--meder-line)]";
  return (
    <div className={`border-t ${line}`}>
      {items.map((item, i) => (
        <details key={item.title} className={`meder-details group border-b ${line}`}>
          <summary className="flex cursor-pointer list-none items-start gap-5 py-6">
            {numbered ? (
              <span className={`pt-1 text-sm tabular-nums ${dark ? "text-white/40" : "text-[var(--meder-ink-faint)]"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
            ) : null}
            <span className="meder-h3 flex-1">{item.title}</span>
            <Plus
              className={`mt-1 h-5 w-5 shrink-0 transition group-open:rotate-45 ${dark ? "text-white/50" : "text-[var(--meder-ink-faint)]"}`}
              strokeWidth={1.75}
            />
          </summary>
          <p
            className={`pb-6 pr-10 text-base leading-relaxed ${numbered ? "pl-10" : ""} ${dark ? "text-white/65" : "text-[var(--meder-ink-soft)]"}`}
          >
            {item.text}
          </p>
        </details>
      ))}
    </div>
  );
}

function SectionHead({
  label,
  title,
  dark = false,
  children,
}: {
  label: string;
  title: string;
  dark?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="max-w-3xl">
      <p className={`meder-label ${dark ? "text-white/55" : ""}`}>{label}</p>
      <h2 className="meder-h2 mt-5">{title}</h2>
      {children ? (
        <div className={`mt-6 text-lg leading-relaxed ${dark ? "text-white/65" : "text-[var(--meder-ink-soft)]"}`}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function MederLanding() {
  const [query, setQuery] = useState("");
  const [searchPhase, setSearchPhase] = useState<SearchPhase>("idle");
  const [resolvedName, setResolvedName] = useState("");
  const [groups, setGroups] = useState<LandingTeaserGroup[]>([]);
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY);
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
      <header className="sticky top-0 z-40 border-b border-[var(--meder-line)] bg-[var(--meder-paper)]/90 backdrop-blur-md">
        <div className={`${SECTION} flex h-16 items-center justify-between`}>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-2xl font-semibold tracking-[-0.04em]"
            onClick={closeMenu}
          >
            <RiverMotif className="h-6 text-[var(--meder-river)]" />
            meder.
          </Link>
          <nav className="hidden items-center gap-7 lg:flex" aria-label="Oldal navigáció">
            {HEADER_NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="text-sm font-medium text-[var(--meder-ink-soft)] transition hover:text-[var(--meder-ink)]"
              >
                {item.label}
              </a>
            ))}
            <a href="#kapcsolat" onClick={fillContactName} className="meder-cta py-2.5 text-sm">
              Beszéljünk
            </a>
          </nav>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="meder-mobile-nav"
            aria-label={menuOpen ? "Menü bezárása" : "Menü megnyitása"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
          </button>
        </div>
        {menuOpen ? (
          <nav
            id="meder-mobile-nav"
            className="border-t border-[var(--meder-line)] bg-[var(--meder-paper)] lg:hidden"
            aria-label="Mobil navigáció"
          >
            <div className={`${SECTION} flex flex-col py-3`}>
              {HEADER_NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="border-b border-[var(--meder-line)] py-4 text-lg font-medium"
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
                className="meder-cta mt-5 mb-3 h-12"
              >
                Beszéljünk
              </a>
            </div>
          </nav>
        ) : null}
      </header>

      {/* 1. Hero */}
      <section className="relative overflow-hidden">
        <RiverMotif className="pointer-events-none absolute -right-[12%] top-6 w-[78vw] max-w-[820px] text-[var(--meder-river-light)] md:-right-[4%] md:top-0 md:w-[54vw]" />
        <div className={`${SECTION} relative pt-16 pb-14 md:pt-28 md:pb-20`}>
          <p className="meder-label">(Szerzőknek, előadóknak, kiadóknak)</p>
          <h1 className="meder-h1 mt-6 max-w-5xl">
            Ezt a pénzt már megkerested.{" "}
            <span className="text-[var(--meder-river)]">Csak elakadt valahol.</span>
          </h1>
          <div className="mt-10 grid gap-10 md:mt-14 md:grid-cols-[minmax(0,34rem)_1fr] md:items-end">
            <p className="text-lg leading-relaxed text-[var(--meder-ink-soft)] md:text-xl">
              Akár szerző vagy, akár előadó, akár mindkettő: a jogdíjaid ugyanúgy elakadnak
              útközben. Megkeressük őket itthon és külföldön, és végigvisszük a kifizetésig.
            </p>
            <div className="flex flex-col items-start gap-4 md:items-end">
              <div className="flex flex-wrap gap-3">
                <a href="#ellenorzes" className="meder-cta">
                  Megnézem, szerepelek-e
                </a>
                <a
                  href="#kapcsolat"
                  onClick={fillContactName}
                  className="meder-cta border border-[var(--meder-ink)] bg-transparent text-[var(--meder-ink)] hover:bg-[var(--meder-ink)] hover:text-[var(--meder-paper)]"
                >
                  Inkább egyeztessünk
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
                </a>
              </div>
              <p className="text-sm text-[var(--meder-ink-soft)]">
                Nincs előleg · A jogaid nálad maradnak · Tételes elszámolás
              </p>
            </div>
          </div>
        </div>
        <div className="relative border-t border-[var(--meder-line)]">
          <div className={`${SECTION} grid gap-6 py-8 sm:grid-cols-[1.3fr_repeat(3,1fr)] sm:items-end`}>
            <p className="text-sm font-medium text-[var(--meder-ink-soft)]">
              Szerzői és szomszédos jogok,
              <br className="hidden sm:block" /> itthon és külföldön
            </p>
            {HERO_STATS.map((s) => (
              <div key={s.label}>
                <p className="text-4xl font-semibold tracking-[-0.04em] md:text-5xl">{s.value}</p>
                <p className="mt-1 text-sm text-[var(--meder-ink-soft)]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Előzetes ellenőrzés */}
      <section id="ellenorzes" className="scroll-mt-16 bg-[var(--meder-white)]">
        <div className={`${SECTION} py-20 md:py-28`}>
          <div className="grid gap-12 lg:grid-cols-[1fr_minmax(0,30rem)] lg:gap-20">
            <SectionHead label="(Előzetes ellenőrzés)" title="Szerepelsz a kifizetetlen listákon?">
              <p>
                Írd be a neved úgy, ahogy a kiadványokon szerepel. Megnézzük a magyar és külföldi
                jogkezelőknél az azonosítatlan felhasználásokat, amelyek gazdára várnak,
                szerzői és előadói oldalon is.
              </p>
              <p className="mt-4 text-base">
                Ez az első kör, nem a teljes vizsgálat: a film- és reklámfelhasználások nagy része
                csak a teljes átnézésben kerül elő.
              </p>
            </SectionHead>
            <form onSubmit={runSearch} className="flex flex-col justify-end gap-3">
              <label htmlFor="meder-query" className="meder-label">
                A neved a kiadványokon (szóló, zenekar vagy álnév)
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--meder-ink-faint)]" />
                <input
                  id="meder-query"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="pl. Kovács Anna"
                  className="meder-input h-14 pl-11! text-lg!"
                  minLength={2}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={searchPhase === "loading"}
                className="meder-cta h-14 text-base disabled:opacity-50"
              >
                {searchPhase === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ellenőrzés"}
              </button>
            </form>
          </div>

          {searchPhase !== "idle" && (
            <div className="mt-14">
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

      {/* 3. Ilyen apróságokon múlik */}
      <section className="border-t border-[var(--meder-line)]">
        <div className={`${SECTION} py-24 md:py-36`}>
          <p className="meder-label">(Ilyen apróságokon múlik)</p>
          <RevealText
            className="meder-statement mt-8 max-w-5xl"
            text="Egy filmnél elírták az előadó nevét a stáblistán. Ennyi elég volt: a jogdíj évekig elakadt. Senki nem hibázott nagyot. Csak senki nem nézett utána."
          />
        </div>
      </section>

      {/* 4. Hol akad el a pénz */}
      <section className="relative overflow-hidden bg-[var(--meder-ink)] text-[var(--meder-paper)]">
        <div className={`${SECTION} grid gap-14 py-20 md:py-28 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-20`}>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SectionHead label="(Hol szakad el a lánc)" title="Hol akad el a pénz" dark>
              <p>
                A felhasználás megtörténik, a pénz be is folyik a jogkezelőhöz. Útközben viszont
                elég egy hiányzó adat, és nem talál el hozzád.
              </p>
            </SectionHead>
            <RiverMotif className="mt-12 hidden w-56 text-[var(--meder-river)] lg:block" />
          </div>
          <div>
            <Accordion items={CHAIN_BREAKS} dark numbered />
            <RevealText
              dark
              className="mt-14 max-w-2xl text-2xl font-medium leading-snug tracking-[-0.02em] md:text-3xl"
              text="A jogkezelők ugyanazt akarják, amit te: hogy a pénz megtalálja a gazdáját. A hiányzó láncszem az adat. Mi ezt állítjuk elő, a te nevedben."
            />
          </div>
        </div>
      </section>

      {/* 5. Kiknek dolgozunk */}
      <section id="kiknek" className="scroll-mt-16">
        <div className={`${SECTION} py-20 md:py-28`}>
          <SectionHead label="(Kiknek dolgozunk)" title="Kinél mi akad el" />
          <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-[var(--meder-line)] bg-[var(--meder-line)] md:grid-cols-2">
            {AUDIENCES.map((a) => (
              <article key={a.label} className="flex flex-col bg-[var(--meder-paper)] p-8 md:p-10">
                <p className="meder-label text-[var(--meder-river-deep)]">{a.label}</p>
                <h3 className="meder-h3 mt-4 text-2xl! md:text-3xl!">{a.title}</h3>
                <p className="mt-4 leading-relaxed text-[var(--meder-ink-soft)]">{a.text}</p>
                {a.note ? (
                  <p className="mt-auto pt-6 text-sm text-[var(--meder-ink-faint)]">{a.note}</p>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 6. Miért mi */}
      <section className="bg-[var(--meder-river-light)]">
        <div className={`${SECTION} grid gap-12 py-20 md:py-28 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-20`}>
          <SectionHead label="(Miért mi)" title="Belülről, gyorsabban" />
          <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {WHY_US.map((item) => (
              <div key={item.title} className="border-t border-[var(--meder-ink)]/20 pt-6">
                <h3 className="meder-h3">{item.title}</h3>
                <p className="mt-3 leading-relaxed text-[var(--meder-ink-soft)]">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 7. Hogyan dolgozunk */}
      <section id="hogyan" className="scroll-mt-16">
        <div className={`${SECTION} py-20 md:py-28`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <SectionHead label="(Hogyan dolgozunk)" title="A lelettől a karbantartásig" />
            <a href="#kapcsolat" onClick={fillContactName} className="meder-link">
              Beszéljünk +
            </a>
          </div>
          <ol className="mt-14 grid gap-10 md:grid-cols-4 md:gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="border-t-2 border-[var(--meder-ink)] pt-6">
                <p className="text-sm tabular-nums text-[var(--meder-river-deep)]">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="meder-h3 mt-3 text-2xl!">{step.title}</h3>
                <p className="mt-3 leading-relaxed text-[var(--meder-ink-soft)]">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 8. Mi nem vagyunk */}
      <section className="bg-[var(--meder-ink)] text-[var(--meder-paper)]">
        <div className={`${SECTION} py-20 md:py-28`}>
          <div className="grid gap-12 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-20">
            <SectionHead label="(Átlátható elvárások)" title="Mi nem vagyunk" dark />
            <ul className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
              {NOT_US.map((item) => (
                <li key={item.lead} className="border-t border-white/15 pt-6">
                  <p className="meder-h3">{item.lead}</p>
                  <p className="mt-2 text-white/60">{item.rest}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-20 grid gap-8 rounded-3xl bg-white/[0.06] p-8 md:grid-cols-[1fr_auto] md:items-center md:p-12">
            <div>
              <h3 className="text-3xl font-semibold tracking-[-0.03em] md:text-4xl">
                Miért nem érdemes halogatni
              </h3>
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/65">
                Az igényérvényesítésnek időbeli korlátai vannak. Ami kicsúszik belőlük, az
                véglegesen máshova kerül. Minél korábban kezdjük, annál kevesebb vész el.
              </p>
            </div>
            <a href="#kapcsolat" onClick={fillContactName} className="meder-cta meder-cta-light">
              {CTA_LABEL}
            </a>
          </div>
        </div>
      </section>

      {/* 9. Díjazás */}
      <section id="dijazas" className="scroll-mt-16 bg-[var(--meder-white)]">
        <div className={`${SECTION} py-20 md:py-28`}>
          <SectionHead label="(Díjazás)" title="Mennyibe kerül" />
          <div className="mt-14 grid gap-4 md:grid-cols-3">
            {PRICES.map((p, i) => (
              <div
                key={p.name}
                className={`flex flex-col rounded-3xl p-8 md:p-10 ${
                  i === 1
                    ? "bg-[var(--meder-ink)] text-[var(--meder-paper)]"
                    : "border border-[var(--meder-line)] bg-[var(--meder-paper)]"
                }`}
              >
                <p className={`meder-label ${i === 1 ? "text-white/60" : ""}`}>{p.name}</p>
                <p className="mt-6 text-6xl font-semibold tracking-[-0.05em] md:text-7xl">{p.value}</p>
                <p className={`mt-6 leading-relaxed ${i === 1 ? "text-white/70" : "text-[var(--meder-ink-soft)]"}`}>
                  {p.text}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-[var(--meder-ink-soft)]">
            Megújuló keret · Felmondás 90 napra · A jogaid nálad maradnak
          </p>
          <div className="mt-16 grid gap-10 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-20">
            <p className="meder-h3">Gyakori kérdések</p>
            <Accordion items={PRICING_FAQ} />
          </div>
        </div>
      </section>

      {/* 10. Rólunk */}
      <section id="rolunk" className="scroll-mt-16">
        <div className={`${SECTION} py-20 md:py-28`}>
          <p className="meder-label">(Kik vagyunk)</p>
          <h2 className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <span className="meder-h2">Meder</span>
            <span className="text-lg font-medium text-[var(--meder-ink-soft)]">Rights Management</span>
          </h2>
          <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-10">
            {TEAM.map((person) => (
              <article key={person.key} className="border-t border-[var(--meder-line)] pt-8">
                <div className="relative h-24 w-24 overflow-hidden rounded-full bg-[var(--meder-river-light)]">
                  {person.imageSrc ? (
                    <Image
                      src={person.imageSrc}
                      alt={`${person.name} fotó`}
                      fill
                      sizes="96px"
                      className="object-cover grayscale"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-full w-full items-center justify-center text-xl font-semibold text-[var(--meder-river-deep)]"
                    >
                      {person.name
                        .split(" ")
                        .map((part) => part[0])
                        .join("")}
                    </span>
                  )}
                </div>
                <h3 className="meder-h3 mt-6">{person.name}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-[var(--meder-ink-soft)]">{person.bio}</p>
                {person.links.length ? (
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                    {person.links.map((l) => (
                      <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className="meder-link">
                        {l.label}
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          <p className="mt-16 max-w-3xl text-lg leading-relaxed text-[var(--meder-ink-soft)]">
            A Meder mögött három nézőpont találkozik. Zsófia a jogi stratégiát és a gondolkodás
            tisztaságát adja. Tamás a kiadói adminisztráció gyakorlatát, Renátó a sync és a
            jogdíj-kezelés tapasztalatát, és azt, hogy a hiányzó láncszemeket szoftverrel is
            megépíti, nem csak kézzel keresi.
          </p>
          <RevealText
            className="meder-statement mt-20 max-w-4xl"
            text="A jogdíjnak van egy medre. Mi visszatereljük bele, és benne is tartjuk."
          />
        </div>
      </section>

      {/* 11. Kapcsolat */}
      <section
        id="kapcsolat"
        className="relative scroll-mt-16 overflow-hidden bg-[var(--meder-ink)] text-[var(--meder-paper)]"
      >
        <RiverMotif className="pointer-events-none absolute -bottom-24 -left-24 w-[520px] text-[var(--meder-river)] opacity-30 md:-left-10" />
        <div className={`${SECTION} relative grid gap-14 py-20 md:py-28 lg:grid-cols-2 lg:gap-20`}>
          <SectionHead label="(Kapcsolat)" title="Beszéljünk" dark>
            <p>Húsz perc alatt kiderül, van-e mit keresni nálad. Ha nincs, azt is megmondjuk.</p>
            <p className="mt-6 text-base">
              <a href="mailto:hello@meder.hu" className="meder-link text-[var(--meder-paper)]">
                hello@meder.hu
              </a>
            </p>
          </SectionHead>

          {sent ? (
            <p className="self-start rounded-2xl border border-white/20 px-6 py-8 text-lg font-medium">
              Megkaptuk. Két munkanapon belül jelentkezünk.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Field id="meder-name" label="Név">
                <input
                  id="meder-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="meder-input-on-color"
                />
              </Field>
              <Field id="meder-email" label="E-mail">
                <input
                  id="meder-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="meder-input-on-color"
                />
              </Field>
              <Field id="meder-phone" label="Telefon" optional>
                <input
                  id="meder-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ha hívást kérsz"
                  className="meder-input-on-color"
                />
              </Field>
              <Field id="meder-occ" label="Mivel foglalkozol">
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
              </Field>
              <Field id="meder-msg" label="Miről van szó" optional>
                <textarea
                  id="meder-msg"
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Pár mondat: mit írsz vagy játszol, hol jelent meg, mi nem stimmel."
                  className="meder-input-on-color resize-y"
                />
              </Field>
              {formError ? <p className="text-sm font-medium text-[#f0b8a0]">{formError}</p> : null}
              <button
                type="submit"
                disabled={sending}
                className="meder-cta meder-cta-light h-14 w-full text-base disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Elküldöm"}
              </button>
              <p className="text-sm text-white/45">
                Az adataidat kizárólag a megkeresésed megválaszolására használjuk.{" "}
                <Link href="/adatvedelem" className="underline hover:text-white/75">
                  Adatkezelés
                </Link>
              </p>
            </form>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[var(--meder-ink)] text-[var(--meder-paper)]">
        <div className={`${SECTION} flex flex-col gap-6 py-10 md:flex-row md:items-end md:justify-between`}>
          <div>
            <p className="inline-flex items-center gap-2 text-2xl font-semibold tracking-[-0.04em]">
              <RiverMotif className="h-6 text-[var(--meder-river-glow)]" />
              meder.
            </p>
            <p className="mt-3 text-sm text-white/50">hello@meder.hu · Cégadatok hamarosan</p>
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-white/55">
            <Link href="/adatvedelem" className="hover:text-white">
              Adatkezelés
            </Link>
          </div>
        </div>
      </footer>

      {/* Mobile sticky */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--meder-line)] bg-[var(--meder-paper)]/95 p-3 backdrop-blur md:hidden">
        <a href="#kapcsolat" onClick={fillContactName} className="meder-cta h-12 w-full">
          {CTA_LABEL}
        </a>
      </div>
      <div className="h-[72px] md:hidden" aria-hidden />
    </div>
  );
}

function Field({
  id,
  label,
  optional = false,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-white/65">
        {label}
        {optional ? <span className="font-normal text-white/40"> (opcionális)</span> : null}
      </label>
      {children}
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
  summary: Summary;
  resolvedName: string;
  onPrimaryCta: () => void;
}) {
  if (phase === "loading") {
    return (
      <div className="rounded-3xl border border-[var(--meder-line)] bg-[var(--meder-paper)] px-6 py-14 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-[var(--meder-river)]" />
        <p className="mt-4 text-lg">
          Magyar és külföldi listákat nézünk <strong className="font-semibold">{resolvedName}</strong> névre…
        </p>
        <p className="mt-2 text-sm text-[var(--meder-ink-soft)]">
          Néhány forrás lassabb, ez fél percig is eltarthat.
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
            title: "A kereső most nem elérhető",
            body: "Add meg a kapcsolati adataidat, és kézzel nézzük át a listákat.",
          }
        : status === "error"
          ? {
              title: "Hiba történt a keresés közben",
              body: "Próbáld újra, vagy írj nekünk, utánanézünk.",
            }
          : {
              title: "Nincs egyértelmű találat",
              body: "Ez nem jelenti, hogy nincs kint pénzed: a film, a reklám és a külföldi lejelentések nagy részét csak megbízással tudjuk lekérni.",
            };

    return (
      <div className="rounded-3xl border border-[var(--meder-line)] bg-[var(--meder-paper)] p-8 md:p-10">
        <div className="flex items-center gap-2 text-[var(--meder-ink-soft)]">
          <SearchX className="h-4 w-4" />
          <span className="meder-label">{copy.title}</span>
        </div>
        <p className="meder-h3 mt-4 text-3xl!">{resolvedName}</p>
        <p className="mt-3 max-w-2xl leading-relaxed text-[var(--meder-ink-soft)]">{copy.body}</p>
        <button type="button" onClick={onPrimaryCta} className="meder-cta mt-8">
          {CTA_LABEL}
        </button>
      </div>
    );
  }

  const summaryLine = [
    `${summary.totalItems} tétel`,
    `${summary.countries} ország`,
    summary.rights.map((r) => RIGHT_SHORT[r]).join(" / "),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--meder-line)] bg-[var(--meder-paper)]">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--meder-line)] p-8 md:p-10">
        <div>
          <p className="meder-label text-[var(--meder-river-deep)]">(Valószínű találat)</p>
          <p className="meder-h3 mt-3 text-3xl! md:text-4xl!">
            {resolvedName} <span className="text-[var(--meder-ink-faint)]">· azonosítatlan tételek</span>
          </p>
        </div>
        <p className="text-sm font-medium text-[var(--meder-ink-soft)]">{summaryLine}</p>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-2 md:p-6">
        {visibleGroups.map((group) => (
          <MederResultGroup key={group.key} group={group} />
        ))}
      </div>
      {hiddenCount > 0 ? (
        <p className="px-8 pb-2 text-sm text-[var(--meder-ink-soft)] md:px-10">
          +{hiddenCount} további ország vagy jogtípus a teljes átnézésben.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-8 md:px-10">
        <p className="meder-h3 w-full">
          Ráismersz a dalaidra? A teljes listát és a következő lépést a beszélgetésen nézzük át.
        </p>
        <button type="button" onClick={onPrimaryCta} className="meder-cta">
          {CTA_LABEL}
        </button>
        <p className="text-sm text-[var(--meder-ink-soft)]">Nincs kötelezettség.</p>
      </div>
    </div>
  );
}

const GHOSTS: LandingTeaserHit[] = [{ title: "Azonosítatlan tétel" }, { title: "Azonosítatlan tétel" }];

function MederResultGroup({ group }: { group: LandingTeaserGroup }) {
  const isFuzzy = group.confidence === "fuzzy";
  const visibleHits = isFuzzy ? [] : group.hits;
  const remaining = group.total - visibleHits.length;
  const ghostCount = Math.min(2, Math.max(remaining, 0));
  const ghostHits =
    visibleHits.length > 0 ? group.hits.slice(0, ghostCount) : GHOSTS.slice(0, ghostCount);

  return (
    <div className="rounded-2xl bg-[var(--meder-white)] p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl leading-none">{group.flag}</span>
          <span className="font-semibold">{group.region}</span>
          <span
            className={`meder-chip ${
              group.right === "author"
                ? "border-transparent bg-[var(--meder-river-light)] text-[var(--meder-river-deep)]"
                : ""
            }`}
          >
            {RIGHT_LABEL[group.right]}
          </span>
        </div>
        <span className="text-sm tabular-nums text-[var(--meder-ink-soft)]">
          {visibleHits.length === 0
            ? `${group.total} tétel`
            : remaining > 0
              ? `Top ${visibleHits.length} / ${group.total}`
              : `Mind a ${group.total}`}
        </span>
      </div>
      {isFuzzy ? (
        <p className="mt-3 text-sm text-[var(--meder-ink-soft)]">Csak névegyezés, ellenőrizzük.</p>
      ) : null}
      <div className="mt-4 space-y-2">
        {visibleHits.map((hit, i) => (
          <MederHitRow key={`${group.key}-${i}`} hit={hit} />
        ))}
        {remaining > 0 && ghostHits.length > 0 ? (
          <div className="relative">
            <div aria-hidden className="space-y-2 blur-[5px] select-none">
              {ghostHits.map((hit, i) => (
                <MederHitRow key={`g-${group.key}-${i}`} hit={hit} />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--meder-line)] bg-[var(--meder-white)] px-3 py-1 text-xs font-semibold text-[var(--meder-ink-soft)]">
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
    <div className="flex items-center gap-2.5 text-[15px]">
      <Music4 className="h-3.5 w-3.5 shrink-0 text-[var(--meder-river)]" />
      <span className="truncate">{hit.title}</span>
      {hit.type || hit.year ? (
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-[var(--meder-ink-faint)]">
          {hit.type ? <span>{hit.type}</span> : null}
          {hit.year ? <span>{hit.year}</span> : null}
        </span>
      ) : null}
    </div>
  );
}
