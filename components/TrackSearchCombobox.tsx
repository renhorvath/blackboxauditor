"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { SearchTrackHit } from "@/lib/types";

export function TrackSearchCombobox({
  onPick,
}: {
  onPick: (hit: SearchTrackHit) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hits, setHits] = useState<SearchTrackHit[]>([]);
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
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      const data = (await res.json()) as {
        tracks?: SearchTrackHit[];
        error?: string;
      };
      if (!res.ok) {
        setHits([]);
        setError(data.error ?? "Keresési hiba");
        return;
      }
      setHits(data.tracks ?? []);
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

  function pick(hit: SearchTrackHit) {
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
      <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">Előadó / dal</label>
      <div className="relative mt-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <input
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="track-search-listbox"
          aria-autocomplete="list"
          placeholder="Kezdj el gépelni egy nevet…"
          autoComplete="off"
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
          id="track-search-listbox"
          role="listbox"
          className="absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-[10px] border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg"
        >
          {hits.length === 0 && !loading ? (
            <li className="px-3 py-2 text-sm text-[var(--text-muted)]">
              Nincs találat.
            </li>
          ) : (
            hits.map((hit, idx) => {
              const subtitle = [hit.artists.join(", "), hit.album].filter(Boolean).join(" · ");
              const active = idx === highlight;
              const noIsrc = !hit.isrc;
              return (
                <li key={hit.spotifyId} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={noIsrc}
                    title={
                      noIsrc
                        ? "Ehhez a Spotify felvételhez nem tartozik ISRC az API szerint."
                        : undefined
                    }
                    className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm transition ${
                      active ? "bg-[var(--bg-secondary)]" : ""
                    } ${noIsrc ? "cursor-not-allowed opacity-50" : "hover:bg-[var(--bg-secondary)]"}`}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      if (!noIsrc) pick(hit);
                    }}
                  >
                    <span className="font-medium text-[var(--text-primary)]">{hit.title}</span>
                    <span className="mt-0.5 text-xs text-[var(--text-secondary)]">{subtitle}</span>
                    <span className="mt-1 font-mono text-[11px] text-[var(--text-muted)]">
                      {noIsrc ? "Nincs ISRC (nem sorba tehető)" : hit.isrc}
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
