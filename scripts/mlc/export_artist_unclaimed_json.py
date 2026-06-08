#!/usr/bin/env python3
"""Return MLC unclaimed work share hits for an artist as JSON (stdout)."""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from paths import data_dir, unclaimed_tsv_path  # noqa: E402
from scan_tsv_by_artist import slugify  # noqa: E402
from scan_unclaimed_by_artist import scan_unclaimed_artist  # noqa: E402


def load_export_unique(export_path: Path) -> list[dict[str, str | float | None]]:
    if not export_path.is_file():
        return []
    by_isrc: dict[str, dict[str, str | float | None]] = {}
    with export_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            isrc = (row.get("ISRC") or "").strip().upper()
            if not isrc:
                continue
            pct_raw = (row.get("UnclaimedRightSharePercentage") or "").strip()
            try:
                pct = float(pct_raw) if pct_raw else None
            except ValueError:
                pct = None

            existing = by_isrc.get(isrc)
            if existing is None:
                by_isrc[isrc] = {
                    "isrc": isrc,
                    "title": (row.get("ResourceTitle") or "").strip(),
                    "artist": (row.get("DisplayArtistName") or "").strip(),
                    "workRecordId": (row.get("MusicalWorkRecordId") or "").strip(),
                    "unclaimedPct": pct,
                    "dspResourceId": (row.get("DspResourceId") or "").strip(),
                }
                continue

            if pct is not None:
                prev = existing.get("unclaimedPct")
                if prev is None or (isinstance(prev, (int, float)) and pct > prev):
                    existing["unclaimedPct"] = pct

    return list(by_isrc.values())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True, help="Artist name")
    parser.add_argument("--tsv", default=str(unclaimed_tsv_path()))
    parser.add_argument(
        "--out-dir",
        default=str(data_dir() / "hu_artist_scans"),
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
    export_path = artist_dir / f"{slug}_mlc_unclaimed_export.csv"

    if not args.use_cache or not export_path.is_file():
        scan_unclaimed_artist(
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
