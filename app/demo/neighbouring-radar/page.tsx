import { Syne, IBM_Plex_Mono } from "next/font/google";
import { NeighbouringRadarDemo } from "@/components/demo/NeighbouringRadarDemo";
import data from "@/data/demo/neighbouring-radar.json";

const syne = Syne({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-radar-display",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-radar-mono",
});

export const metadata = {
  title: "Neighbouring Radar — EJI demo",
  description:
    "EJI felvételek × külföldi szomszédos UP — matching demonstrátor meetingre.",
};

export default function NeighbouringRadarPage() {
  return (
    <div className={`${syne.variable} ${mono.variable}`}>
      <NeighbouringRadarDemo data={data} />
    </div>
  );
}
