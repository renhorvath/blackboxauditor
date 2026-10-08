#!/usr/bin/env python3
"""Snowball scrape of the public MAHASZ jogosultkutatás search (mahasz.hu/jogosultkutatas).

The site has no bulk export; the search is a substring match with a 4-character minimum.
We query 4-grams of every known artist/title, add newly found tracks, and repeat with their
4-grams until queries stop yielding new tracks. Merges into raw/cmo/hu-mahasz/tracks.csv.

  python3 scripts/cmo/fetch_mahasz.py [--max-queries N] [--workers 3] [--seed-file names.txt]

Progress (queried grams) is kept in raw/cmo/hu-mahasz/.queried.txt so runs can resume.
"""

from __future__ import annotations

import argparse
import csv
import html
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "raw" / "cmo" / "hu-mahasz"
TRACKS = DIR / "tracks.csv"
QUERIED = DIR / ".queried.txt"
URL = "https://www.mahasz.hu/jogosultkutatas/"
FIELDS = ["id", "artist", "title", "version", "distributions"]

ROW = re.compile(
    r'<tr>\s*<td class="rh_src_line[^"]*">(.*?)</td>\s*'
    r'<td class="rh_src_line[^"]*">(.*?)</td>\s*'
    r'<td class="rh_src_line[^"]*">(.*?)</td>\s*'
    r'<td class="rh_src_line[^"]*"><a[^>]*rh_src_ext_line_(\d+)[^>]*>.*?</a></td>\s*</tr>\s*'
    r"<tr>.*?<ul>(.*?)</ul>",
    re.S,
)
LI = re.compile(r"<li>(.*?)</li>", re.S)


def clean(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", value))).strip()


def search(term: str, retries: int = 3) -> list[dict]:
    body = urllib.parse.urlencode({"search_for": term}).encode()
    for attempt in range(retries):
        try:
            req = urllib.request.Request(URL, data=body, headers={"User-Agent": "Mozilla/5.0 (meder research)"})
            with urllib.request.urlopen(req, timeout=180) as resp:
                text = resp.read().decode("utf-8", errors="replace")
            out = []
            for artist, title, version, tid, dist in ROW.findall(text):
                out.append(
                    {
                        "id": tid,
                        "artist": clean(artist),
                        "title": clean(title),
                        "version": clean(version),
                        "distributions": " | ".join(clean(li) for li in LI.findall(dist)),
                    }
                )
            return out
        except Exception as err:  # noqa: BLE001
            if attempt == retries - 1:
                print(f"  ! {term!r}: {err}", file=sys.stderr)
                return []
            time.sleep(5 * (attempt + 1))
    return []


def fold(value: str) -> str:
    text = unicodedata.normalize("NFD", value.lower())
    return "".join(c for c in text if unicodedata.category(c) != "Mn")


def grams(value: str) -> set[str]:
    out: set[str] = set()
    for word in re.findall(r"\w{4,}", fold(value)):
        for i in range(len(word) - 3):
            out.add(word[i : i + 4])
    return out


def load_tracks() -> dict[str, dict]:
    if not TRACKS.is_file():
        return {}
    with TRACKS.open(encoding="utf-8-sig", newline="") as f:
        return {r["id"]: r for r in csv.DictReader(f)}


def save_tracks(tracks: dict[str, dict]) -> None:
    tmp = TRACKS.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for tid in sorted(tracks, key=int):
            w.writerow({k: tracks[tid].get(k, "") for k in FIELDS})
    tmp.replace(TRACKS)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-queries", type=int, default=20000)
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--seed-file", type=Path, help="extra names/titles (one per line) to mine 4-grams from")
    args = ap.parse_args()

    DIR.mkdir(parents=True, exist_ok=True)
    tracks = load_tracks()
    queried = set(QUERIED.read_text(encoding="utf-8").split()) if QUERIED.is_file() else set()
    start = len(tracks)
    print(f"Known tracks: {start:,} · queried grams: {len(queried):,}")

    weights: Counter[str] = Counter()
    for t in tracks.values():
        for g in grams(f"{t['artist']} {t['title']} {t['version']}"):
            weights[g] += 1
    if args.seed_file and args.seed_file.is_file():
        for line in args.seed_file.read_text(encoding="utf-8", errors="replace").splitlines():
            for g in grams(line):
                weights[g] += 1

    done = 0
    qlog = QUERIED.open("a", encoding="utf-8")
    try:
        while done < args.max_queries:
            batch = [g for g, _ in weights.most_common() if g not in queried][: args.workers * 20]
            if not batch:
                break
            new_in_batch = 0
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                futures = {pool.submit(search, g): g for g in batch}
                for fut in as_completed(futures):
                    g = futures[fut]
                    queried.add(g)
                    qlog.write(g + "\n")
                    done += 1
                    for row in fut.result():
                        if row["id"] not in tracks:
                            tracks[row["id"]] = row
                            new_in_batch += 1
                            for ng in grams(f"{row['artist']} {row['title']} {row['version']}"):
                                weights[ng] += 1
            qlog.flush()
            save_tracks(tracks)
            ids = [int(i) for i in tracks]
            print(
                f"queries {done:,} · tracks {len(tracks):,} (+{len(tracks) - start:,}, batch +{new_in_batch}) "
                f"· max id {max(ids):,}",
                flush=True,
            )
    finally:
        qlog.close()
        save_tracks(tracks)
    print(f"Done: {len(tracks):,} tracks (+{len(tracks) - start:,}) after {done:,} queries")


if __name__ == "__main__":
    main()
