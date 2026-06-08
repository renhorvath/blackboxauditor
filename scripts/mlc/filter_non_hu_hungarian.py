#!/usr/bin/env python3
"""
Second-pass filter: non-HU ISRC rows that match Hungarian artist signals.

Uses MusicBrainz name index (Aho-Corasick) + known_artist + diacritics layers.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

import ahocorasick

from paths import (
    data_dir,
    export_path,
    mb_artists_json_path,
    tsv_path,
)

MIN_FIELDS = 20
TODAY = date.today().isoformat()
PROGRESS_EVERY = 5_000_000

TSV_FIELDS = ["isrc", "artist", "title", "provider", "priority", "dsp_id"]
MANUAL_FIELDS = ["match_layers", "match_score", "first_added", "last_updated", "review_status", "notes"]
EXPORT_FIELDS = TSV_FIELDS + MANUAL_FIELDS

NON_HU_EXPORT = "hungarian_non_hu_export.csv"


def normalize(value: str) -> str:
    value = (value or "").strip().upper()
    return re.sub(r"\s+", " ", value)


def parse_row(row: list[str]) -> dict[str, str] | None:
    if len(row) < MIN_FIELDS:
        return None
    isrc = row[2].strip()
    if not isrc:
        return None
    return {
        "isrc": isrc,
        "artist": row[8].strip(),
        "title": row[4].strip(),
        "provider": row[16].strip(),
        "priority": row[19].strip(),
        "dsp_id": row[3].strip(),
    }


def build_mb_automaton(path: Path) -> ahocorasick.Automaton:
    if not path.is_file():
        raise SystemExit(f"Missing MB index: {path}\nRun fetch_mb_hu_artists.py first.")
    data = json.loads(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for artist in data.get("artists") or []:
        for raw in [artist.get("name"), artist.get("sort_name"), *(artist.get("aliases") or [])]:
            if not raw:
                continue
            norm = normalize(raw)
            if len(norm) >= 4:
                names.add(norm)

    automaton = ahocorasick.Automaton()
    for name in names:
        automaton.add_word(name, name)
    automaton.make_automaton()
    return automaton


def load_existing_hu_isrcs(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    out: set[str] = set()
    with open(path, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            val = (row.get("isrc") or "").strip().upper()
            if val:
                out.add(val)
    return out


KNOWN_ARTISTS = (
    "TANKCSAPDA", "REPUBLIC", "OMEGA", "LOCOMOTIV GT", "ZORÁN", "ZORAN",
    "DEMJÉN FERENC", "DEMJEN FERENC", "KISPÁL ÉS A BORZ", "QUIMBY",
    "MAGNA CUM LAUDE", "HOOLIGANS", "CARSON COMA", "HALOTT PÉNZ", "HALOTT PENZ",
    "ÁKOS", "AKOS", "EDDA", "BEATRICE", "POKOLGÉP", "POKOLGEP", "KALAPÁCS",
    "KALAPACS", "KOWALSKY MEG A VEGA", "P.MOBIL", "KREDENC", "AZAHRIAH", "KRUBI",
    "DZSÚDLÓ", "DZSUDLO", "WELLHELLO", "ELEFÁNT", "ELEFANT",
)

DIACRITIC_RE = re.compile(r"[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]")
DIACRITIC_KEYWORDS = (
    "MAGYAR", "BUDAPEST", "DEBRECEN", "SZEGED", "PÉCS", "PECS",
    "LÁSZLÓ", "LASZLO", "ZOLTÁN", "ZOLTAN", "GÁBOR", "GABOR",
    "FERENC", "JÁNOS", "JANOS", "ATTILA", "ANDRÁS", "ANDRAS",
)

LAYER_SCORES = {
    "mb_hu_artist": 6,
    "known_artist": 5,
    "diacritics": 2,
}


class Matcher:
    def __init__(self, mb_automaton: ahocorasick.Automaton, mb_name_count: int) -> None:
        self.mb_automaton = mb_automaton
        self.mb_name_count = mb_name_count

    def layer_mb_artist(self, artist_norm: str) -> bool:
        for _end, _name in self.mb_automaton.iter(artist_norm):
            return True
        return False

    def layer_known_artist(self, artist_norm: str) -> bool:
        return any(name in artist_norm for name in KNOWN_ARTISTS)

    def layer_diacritics(self, record: dict[str, str]) -> bool:
        text = f"{record['artist']} {record['title']}"
        if DIACRITIC_RE.search(text):
            return True
        upper = text.upper()
        return any(word in upper for word in DIACRITIC_KEYWORDS)


def log_progress(stats: dict[str, int], started: float) -> None:
    elapsed = time.time() - started
    rate = stats["scanned"] / elapsed if elapsed > 0 else 0
    msg = (
        f"  scanned={stats['scanned']:,} matched={stats['matched']:,} "
        f"export={stats['export_count']:,} rate={rate:,.0f}/s elapsed={elapsed/60:.1f}m"
    )
    print(msg, file=sys.stderr, flush=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Filter non-HU ISRC Hungarian candidates from TSV")
    parser.add_argument("--tsv", default=str(tsv_path()))
    parser.add_argument("--output-dir", default=str(data_dir()))
    parser.add_argument("--layers", default="mb_hu_artist,known_artist,diacritics")
    args = parser.parse_args()

    out_dir = Path(args.output_dir)
    out_path = out_dir / NON_HU_EXPORT
    mb_path = mb_artists_json_path()

    print("Building MB Aho-Corasick index…", file=sys.stderr, flush=True)
    mb_automaton = build_mb_automaton(mb_path)
    mb_count = len(mb_automaton)
    matcher = Matcher(mb_automaton, mb_count)
    existing_hu = load_existing_hu_isrcs(export_path())

    active = [p.strip() for p in args.layers.split(",") if p.strip()]
    use_mb = "mb_hu_artist" in active
    use_known = "known_artist" in active
    use_diacritics = "diacritics" in active
    for name in active:
        if name not in LAYER_SCORES:
            raise SystemExit(f"Unknown layer: {name}")

    export: dict[str, dict[str, str]] = {}
    stats = {
        "scanned": 0,
        "skipped_hu_prefix": 0,
        "skipped_in_export": 0,
        "matched": 0,
        "export_count": 0,
    }
    started = time.time()

    with open(args.tsv, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader, None)
        if header and header[0].startswith("#"):
            header[0] = header[0].lstrip("#")

        for row in reader:
            stats["scanned"] += 1
            if stats["scanned"] % PROGRESS_EVERY == 0:
                stats["export_count"] = len(export)
                log_progress(stats, started)

            record = parse_row(row)
            if not record:
                continue

            isrc = record["isrc"].upper()
            if isrc.startswith("HU"):
                stats["skipped_hu_prefix"] += 1
                continue
            if isrc in existing_hu:
                stats["skipped_in_export"] += 1
                continue

            artist_norm = normalize(record["artist"])
            matched_layers: list[str] = []

            if use_known and matcher.layer_known_artist(artist_norm):
                matched_layers.append("known_artist")
            if use_diacritics and matcher.layer_diacritics(record):
                matched_layers.append("diacritics")
            if use_mb and matcher.layer_mb_artist(artist_norm):
                matched_layers.append("mb_hu_artist")

            if not matched_layers:
                continue

            stats["matched"] += 1
            if isrc in export:
                continue

            score = sum(LAYER_SCORES.get(n, 0) for n in matched_layers)
            export[isrc] = {
                **record,
                "isrc": isrc,
                "match_layers": ";".join(matched_layers),
                "match_score": str(score),
                "first_added": TODAY,
                "last_updated": TODAY,
                "review_status": "auto",
                "notes": "",
            }

    out_dir.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=EXPORT_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for isrc in sorted(export):
            writer.writerow(export[isrc])

    elapsed = time.time() - started
    print(f"MB name patterns (Aho-Corasick): {mb_count:,}")
    print(f"Skipped (already in hu export): {stats['skipped_in_export']:,}")
    print(f"Scanned: {stats['scanned']:,}")
    print(f"Skipped HU prefix rows: {stats['skipped_hu_prefix']:,}")
    print(f"Matched rows (before dedupe): {stats['matched']:,}")
    print(f"Unique non-HU export ISRCs: {len(export):,}")
    print(f"Elapsed: {elapsed/60:.1f} min")
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
