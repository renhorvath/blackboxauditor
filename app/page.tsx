import type { Metadata } from "next";
import { Archivo, Manrope } from "next/font/google";
import { MederLanding } from "@/components/meder/MederLanding";

const mederDisplay = Archivo({
  subsets: ["latin", "latin-ext"],
  weight: ["700", "800", "900"],
  variable: "--font-meder-display",
  display: "swap",
});

const mederSans = Manrope({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-meder-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Meder · jogdíj-visszaszerzés és kiadói adminisztráció",
  description:
    "Beragadt film-, reklám- és külföldi jogdíj visszaszerzése a hivatalos jogkezelői csatornákon, majd folyamatos lejelentés-kezelés. Előleg nélkül.",
  openGraph: {
    title: "Meder · jogdíj-visszaszerzés és kiadói adminisztráció",
    description:
      "Beragadt film-, reklám- és külföldi jogdíj visszaszerzése a hivatalos jogkezelői csatornákon, majd folyamatos lejelentés-kezelés. Előleg nélkül.",
    locale: "hu_HU",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <div className={`${mederDisplay.variable} ${mederSans.variable}`}>
      <MederLanding />
    </div>
  );
}
