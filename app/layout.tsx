import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import Script from "next/script";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const ibm = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm",
});

export const metadata: Metadata = {
  title: "bbox audit — jogdíj-metadata ellenőrzés",
  description:
    "ISRC-alapú audit credits.fm és MLC jelek szerint — szerző IPI-k, ISWC, share státusz.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="hu"
      className={`${inter.variable} ${ibm.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col bg-[var(--bg-secondary)]">
        <Script id="bbox-theme-init" strategy="beforeInteractive">
          {`(function(){try{if(localStorage.getItem('bbox-theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})()`}
        </Script>
        <SiteHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
