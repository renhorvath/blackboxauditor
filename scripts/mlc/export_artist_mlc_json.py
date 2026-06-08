#!/usr/bin/env python3
"""Return unique MLC unmatched ISRCs for an artist as JSON (stdout)."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

# Allow importing sibling modules when run from repo root
sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import data_dir, tsv_path  # noqa: E402
from scan_tsv_by_artist import EXPORT_HEADER, scan_artist, slugify  # noqa: E402


def load_export_unique(export_path: Path) -> list[dict[str, str]]:
    if not export_path.is_file():
        return []
    seen: set[str] = set()
    out: list[dict[str, str]] = []
    with export_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            isrc = (row.get("ISRC") or "").strip().upper()
            if not isrc or isrc in seen:
                continue
            seen.add(isrc)
            out.append(
                {
                    "isrc": isrc,
                    "title": (row.get("ResourceTitle") or "").strip(),
                    "artist": (row.get("DisplayArtistName") or "").strip(),
                    "provider": (row.get("OriginalDataProviderName") or "").strip(),
                }
            )
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True, help="Artist name (e.g. Carson Coma)")
    parser.add_argument("--tsv", default=str(tsv_path()))
    parser.add_argument(
        "--out-dir",
        default=str(data_dir() / "hu_artist_scans"),
        help="Base dir for per-artist exports",
    )
    parser.add_argument(
        "--use-cache",
        action="store_true",
        help="Only read existing export CSV; do not scan TSV",
    )
    parser.add_argument(
        "--no-rg",
        action="store_true",
        help="Stream TSV in Python instead of ripgrep",
    )
    args = parser.parse_args()

    artist_name = args.name.strip()
    slug = slugify(artist_name)
    artist_dir = Path(args.out_dir) / slug
    export_path = artist_dir / f"{slug}_mlc_export.csv"

    if not args.use_cache or not export_path.is_file():
        scan_artist(
            query_name=artist_name,
            tsv_search_name=artist_name,
            tsv=Path(args.tsv),
            out_dir=artist_dir,
            use_rg=not args.no_rg,
            match_mode="collab",
        )

    hits = load_export_unique(export_path)
    payload = {
        "artistName": artist_name,
        "slug": slug,
        "exportPath": str(export_path),
        "uniqueIsrcCount": len(hits),
        "hits": hits,
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
