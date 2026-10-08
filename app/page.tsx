import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import { MederLanding } from "@/components/meder/MederLanding";

const mederFont = Inter_Tight({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-meder",
  display: "swap",
});

const TITLE = "Meder · szerzői és előadói jogdíjak visszaszerzése";
const DESCRIPTION =
  "Elakadt szerzői és előadói jogdíjak felkutatása és visszaszerzése itthon és külföldön, film- és reklámfelhasználásnál is. Előleg nélkül, a jogaid nálad maradnak.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    locale: "hu_HU",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <div className={mederFont.variable}>
      <MederLanding />
    </div>
  );
}
