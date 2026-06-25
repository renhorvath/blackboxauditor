import type { Metadata } from "next";
import { RecoveryLanding } from "@/components/landing/RecoveryLanding";

const TITLE = "Vannak elveszett jogdíjaid? Hozzuk haza őket!";
const DESCRIPTION =
  "Megkeressük a neved a magyar ARTISJUS és EJI, valamint 10+ ország jogkezelőinek nyilvános listáin, kibogozzuk a hiányzó adatokat, és segítünk visszaszerezni a pénzed. Ingyenes, kötelezettség nélkül.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    locale: "hu_HU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const sp = await searchParams;
  const preview = sp.preview === "1" || sp.preview === "true";
  return <RecoveryLanding preview={preview} />;
}
