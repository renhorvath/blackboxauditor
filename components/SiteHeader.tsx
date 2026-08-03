"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "bbox-theme";

/** Marketing / public pages: no bbox tool chrome. */
const HIDE_ON = new Set(["/", "/adatvedelem"]);

function subscribeTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mo = new MutationObserver(callback);
  mo.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => mo.disconnect();
}

function snapshotIsDark() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

export function SiteHeader() {
  const pathname = usePathname();
  const dark = useSyncExternalStore(subscribeTheme, snapshotIsDark, () => false);

  if (HIDE_ON.has(pathname) || pathname.startsWith("/r/")) {
    return null;
  }

  function toggleTheme() {
    if (dark) {
      document.documentElement.removeAttribute("data-theme");
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      try {
        localStorage.setItem(STORAGE_KEY, "dark");
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg-primary)_92%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Meder
          </Link>
          <Link
            href="/check"
            className="text-lg font-semibold tracking-tight text-[var(--text-primary)] lowercase"
          >
            bbox audit
          </Link>
        </div>
        <nav className="flex items-center gap-4">
          <button
            type="button"
            suppressHydrationWarning
            onClick={toggleTheme}
            className="rounded-[10px] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] transition hover:border-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            {dark ? "Világos" : "Sötét"}
          </button>
        </nav>
      </div>
    </header>
  );
}
