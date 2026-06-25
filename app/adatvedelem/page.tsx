import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Adatkezelési tájékoztató",
  description: "Hogyan kezeljük a megadott e-mail címet és előadónevet.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 md:px-6 md:py-16">
      <Link
        href="/landing"
        className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        ← Vissza
      </Link>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-[var(--text-primary)]">
        Adatkezelési tájékoztató
      </h1>
      <p className="mt-2 text-sm text-[var(--text-muted)]">
        Tervezet — a végleges jogi szöveg pontosítás alatt.
      </p>

      <div className="mt-8 space-y-6 text-[var(--text-secondary)]">
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Milyen adatot kezelünk?</h2>
          <p className="mt-2 text-sm leading-relaxed">
            A kereséshez megadott <strong>előadónevet</strong>, valamint az összefoglaló kéréséhez
            megadott <strong>e-mail címet</strong>. Technikai naplóként a böngésződ típusát és a
            hivatkozó oldalt tárolhatjuk.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Mire használjuk?</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Kizárólag arra, hogy elkészítsük és elküldjük a neked szóló jogdíj-összefoglalót, és
            felvegyük veled a kapcsolatot a visszaszerzés érdekében. Marketing célú megkereséshez
            külön hozzájárulást kérünk.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Kinek adjuk át?</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Senkinek. Az adatokat nem értékesítjük és nem adjuk tovább harmadik félnek.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">A jogaid</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Bármikor kérheted az adataid megtekintését, helyesbítését vagy törlését. Írj nekünk, és
            a törlést rövid határidőn belül elvégezzük.
          </p>
        </section>
      </div>
    </div>
  );
}
