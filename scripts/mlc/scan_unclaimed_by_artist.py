#!/usr/bin/env python3
"""Scan unclaimed musical work right shares TSV for rows matching an artist name."""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path

from paths import data_dir, unclaimed_tsv_path
from scan_tsv_by_artist import (
    artist_matches,
    build_terms,
    classify_match,
    run_rg,
    slugify,
)

MIN_FIELDS = 13
EXPORT_HEADER = [
    "tsv_line",
    "UnclaimedMusicalWorkRightShareRecordId",
    "MusicalWorkRecordId",
    "ISRC",
    "DspResourceId",
    "ResourceTitle",
    "DisplayArtistName",
    "Duration",
    "UnclaimedRightSharePercentage",
]


def parse_unclaimed_line(line: str) -> tuple[str, list[str]] | None:
    if ":" not in line:
        return None
    tsv_line, content = line.split(":", 1)
    parts = content.split("\t")
    if len(parts) < MIN_FIELDS:
        return None
    return tsv_line, parts


def scan_unclaimed_artist(
    *,
    query_name: str,
    tsv_search_name: str,
    tsv: Path,
    out_dir: Path,
    use_rg: bool = True,
    match_mode: str = "collab",
    from_hits: Path | None = None,
) -> dict[str, int | str]:
    terms = build_terms(query_name, tsv_search_name)
    slug = slugify(query_name)
    out_dir.mkdir(parents=True, exist_ok=True)
    hits_path = out_dir / f"{slug}_unclaimed_hits.tsv"
    export_path = out_dir / f"{slug}_mlc_unclaimed_export.csv"
    summary_path = out_dir / f"{slug}_unclaimed_summary.txt"

    if from_hits:
        raw_lines = from_hits.read_text(encoding="utf-8", errors="replace").splitlines()
    elif use_rg:
        run_rg(tsv, terms, hits_path)
        raw_lines = hits_path.read_text(encoding="utf-8", errors="replace").splitlines()
    else:
        raw_lines = []
        with open(tsv, "r", encoding="utf-8", errors="replace") as f:
            reader = csv.reader(f, delimiter="\t")
            header = next(reader, None)
            if header and header[0].startswith("#"):
                header[0] = header[0].lstrip("#")
            for line_no, row in enumerate(reader, start=2):
                if len(row) < MIN_FIELDS:
                    continue
                blob = "\t".join(row).lower()
                if any(term.lower() in blob for term in terms):
                    raw_lines.append(f"{line_no}:{'\t'.join(row)}")

    rows_out: list[list[str]] = []
    dropped = 0
    isrcs: set[str] = set()
    artist_variants: Counter[str] = Counter()
    match_kinds: Counter[str] = Counter()

    for line in raw_lines:
        parsed = parse_unclaimed_line(line)
        if not parsed:
            dropped += 1
            continue
        tsv_line, parts = parsed
        artist = parts[8]
        if not artist_matches(artist, terms, match_mode):
            dropped += 1
            continue

        isrc = parts[3].strip().upper()
        match_kind = classify_match(artist, terms, match_mode)
        match_kinds[match_kind] += 1
        if isrc:
            isrcs.add(isrc)
        artist_variants[artist] += 1

        rows_out.append(
            [
                tsv_line,
                parts[0].lstrip("#"),
                parts[2],
                isrc,
                parts[4],
                parts[5],
                artist,
                parts[10] if len(parts) > 10 else "",
                parts[11] if len(parts) > 11 else "",
            ]
        )

    with export_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(EXPORT_HEADER)
        writer.writerows(rows_out)

    summary_lines = [
        f"query_name: {query_name}",
        f"tsv_search_name: {tsv_search_name}",
        f"search_terms: {', '.join(terms)}",
        f"match_mode: {match_mode}",
        f"raw_rg_lines: {len(raw_lines)}",
        f"artist_field_matches: {len(rows_out)}",
        f"dropped_after_artist_filter: {dropped}",
        f"unique_isrcs: {len(isrcs)}",
        "",
        "Match kinds:",
    ]
    for name, count in match_kinds.most_common():
        summary_lines.append(f"  {count:4d}  {name}")
    summary_lines.extend(["", "Top artist variants:"])
    for name, count in artist_variants.most_common(15):
        summary_lines.append(f"  {count:4d}  {name}")

    summary_path.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")

    return {
        "slug": slug,
        "query_name": query_name,
        "rows": len(rows_out),
        "unique_isrcs": len(isrcs),
        "hits_path": str(hits_path),
        "export_path": str(export_path),
        "summary_path": str(summary_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan unclaimed TSV for one artist name")
    parser.add_argument("--name", required=True, help="Artist name to search")
    parser.add_argument("--tsv", default=str(unclaimed_tsv_path()))
    parser.add_argument(
        "--out-dir",
        default=str(data_dir() / "hu_artist_scans"),
        help="Output directory (per-artist subfolder created)",
    )
    parser.add_argument(
        "--match-mode",
        choices=("collab", "exact"),
        default="collab",
    )
    parser.add_argument("--from-hits", help="Reuse existing *_unclaimed_hits.tsv")
    parser.add_argument(
        "--no-rg",
        action="store_true",
        help="Stream TSV in Python instead of ripgrep prefilter",
    )
    args = parser.parse_args()

    artist_name = args.name.strip()
    slug = slugify(artist_name)
    stats = scan_unclaimed_artist(
        query_name=artist_name,
        tsv_search_name=artist_name,
        tsv=Path(args.tsv),
        out_dir=Path(args.out_dir) / slug,
        use_rg=not args.no_rg,
        match_mode=args.match_mode,
        from_hits=Path(args.from_hits) if args.from_hits else None,
    )

    print(f"Artist: {artist_name}")
    print(f"Matched rows: {stats['rows']:,}")
    print(f"Unique ISRCs: {stats['unique_isrcs']:,}")
    print(f"Export: {stats['export_path']}")


if __name__ == "__main__":
    main()
