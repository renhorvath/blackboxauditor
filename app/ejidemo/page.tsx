import { EjiPocDemo } from "@/components/demo/EjiPocDemo";

export const metadata = {
  title: "EJI PoC — adatlap + A/B/C",
  description:
    "Funkcionális EJI hangfelvételi adatlap összeállítás és A/B/C azonosítás.",
  robots: { index: false, follow: false },
};

export default function EjiDemoPage() {
  return <EjiPocDemo />;
}
