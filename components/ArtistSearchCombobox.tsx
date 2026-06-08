"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, Users } from "lucide-react";
import type { SearchArtistHit } from "@/lib/types";

function formatFollowers(n: number | null): string {
  if (n == null) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M követő`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k követő`;
  return `${n} követő`;
}

export function ArtistSearchCombobox({
  onPick,
  disabled,
}: {
  onPick: (hit: SearchArtistHit) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchArtistHit[]>([]);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setHits([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search-artists?q=${encodeURIComponent(q.trim())}`);
      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        setHits([]);
        setError(
          res.status === 404
            ? "Az API nem elérhető ezen a címen. Indítsd a dev szervert: npm run dev (http://localhost:3002)."
            : "Hálózati hiba a keresés során.",
        );
        return;
      }
      const data = (await res.json()) as {
        artists?: SearchArtistHit[];
        error?: string;
      };
      if (!res.ok) {
        setHits([]);
        setError(data.error ?? "Keresési hiba");
        return;
      }
      setHits(data.artists ?? []);
    } catch {
      setHits([]);
      setError("Hálózati hiba a keresés során.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(query);
    }, 320);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  function pick(hit: SearchArtistHit) {
    onPick(hit);
    setOpen(false);
    setQuery("");
    setHits([]);
    setHighlight(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp") && hits.length > 0) {
      setOpen(true);
    }
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || hits.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[highlight];
      if (hit) pick(hit);
    }
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Előadó</label>
      <div className="relative mt-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="artist-search-listbox"
          aria-autocomplete="list"
          placeholder="Kezdj el gépelni egy előadónevet…"
          autoComplete="off"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="input-bbox w-full py-2.5 pl-10 pr-10"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
        ) : null}
      </div>

      {error ? (
        <p className="mt-2 text-sm text-[var(--accent-critical)]" role="alert">
          {error}
        </p>
      ) : null}

      {open && query.trim().length >= 2 ? (
        <ul
          id="artist-search-listbox"
          role="listbox"
          className="absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg"
        >
          {hits.length === 0 && !loading ? (
            <li className="px-3 py-2 text-sm text-[var(--text-muted)]">Nincs találat.</li>
          ) : (
            hits.map((hit, idx) => {
              const active = idx === highlight;
              const meta = [
                formatFollowers(hit.followers),
                hit.genres.slice(0, 2).join(", "),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={hit.spotifyId} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition ${
                      active ? "bg-[var(--bg-secondary)]" : "hover:bg-[var(--bg-secondary)]"
                    }`}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(hit)}
                  >
                    {hit.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={hit.imageUrl}
                        alt=""
                        className="size-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-secondary)] text-[var(--text-muted)]">
                        <Users className="size-4" aria-hidden />
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium text-[var(--text-primary)]">{hit.name}</span>
                      {meta ? (
                        <span className="mt-0.5 block truncate text-xs text-[var(--text-muted)]">
                          {meta}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
