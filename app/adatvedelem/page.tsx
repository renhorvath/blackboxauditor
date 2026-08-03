import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Adatkezelési tájékoztató — Meder",
  description: "Hogyan kezeljük a megkeresésed során megadott adatokat.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-[#1a1c1a] md:px-6">
      <Link href="/" className="text-sm text-[#1a1c1a]/55 hover:text-[#1a1c1a]">
        ← Meder
      </Link>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Adatkezelési tájékoztató</h1>
      <p className="mt-2 text-sm text-[#1a1c1a]/55">Piszkozat — a végleges szöveg a cégalapítással készül el.</p>

      <div className="mt-10 space-y-6 text-[0.95rem] leading-relaxed text-[#1a1c1a]/80">
        <section>
          <h2 className="font-semibold text-[#1a1c1a]">Milyen adatokat kezelünk</h2>
          <p className="mt-2">
            A kapcsolatfelvételi űrlapon megadott név, e-mail cím, opcionális telefonszám, foglalkozás
            és üzenet. Az előzetes ellenőrzésnél az általad beírt előadónév és (ha megadod) e-mail
            cím.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-[#1a1c1a]">Cél</h2>
          <p className="mt-2">
            Kizárólag a megkeresésed megválaszolása, illetve az általad kért ellenőrzés / összefoglaló
            elküldése. Nem használjuk marketinglistákhoz.
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-[#1a1c1a]">Továbbadás</h2>
          <p className="mt-2">
            Az adatokat nem adjuk tovább harmadik félnek, kivéve ha jogszabály kötelez, vagy a
            szolgáltatás technikai működéséhez szükséges tárhelyszolgáltató (pl. adatbázis).
          </p>
        </section>
        <section>
          <h2 className="font-semibold text-[#1a1c1a]">Jogok</h2>
          <p className="mt-2">
            Bármikor kérheted az adataid törlését vagy helyesbítését a kapcsolatfelvételi e-mailen.
          </p>
        </section>
      </div>
    </div>
  );
}
