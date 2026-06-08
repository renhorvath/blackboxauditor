#!/usr/bin/env python3
"""Scan unmatched TSV for rows whose ISRC is in a target set."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path

from paths import tsv_path

MIN_FIELDS = 20
OUTPUT_FIELDS = ["isrc", "artist", "title", "provider", "priority", "dsp_id"]


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


def load_isrc_set(path: Path) -> set[str]:
    isrcs: set[str] = set()
    with open(path, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        field = "isrc" if "isrc" in (reader.fieldnames or []) else None
        if not field:
            f.seek(0)
            for line in f:
                part = line.strip().split(",")[0]
                if part and part.lower() != "isrc":
                    isrcs.add(part.strip().upper())
            return isrcs
        for row in reader:
            val = (row.get("isrc") or "").strip().upper()
            if val:
                isrcs.add(val)
    return isrcs


def main() -> None:
    parser = argparse.ArgumentParser(description="Find TSV rows for a set of ISRCs")
    parser.add_argument(
        "--isrc-file",
        required=True,
        help="CSV/text file with isrc column or one ISRC per line",
    )
    parser.add_argument("--output", required=True, help="Output CSV path")
    parser.add_argument("--tsv", default=str(tsv_path()), help="Unmatched resources TSV")
    args = parser.parse_args()

    target = load_isrc_set(Path(args.isrc_file))
    if not target:
        raise SystemExit("No ISRCs loaded from --isrc-file")

    seen: set[str] = set()
    found: list[dict[str, str]] = []
    scanned = 0

    with open(args.tsv, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader, None)
        if header and header[0].startswith("#"):
            header[0] = header[0].lstrip("#")

        for row in reader:
            scanned += 1
            record = parse_row(row)
            if not record:
                continue
            isrc = record["isrc"].upper()
            if isrc not in target or isrc in seen:
                continue
            seen.add(isrc)
            found.append(record)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(found)

    print(f"Target ISRCs: {len(target):,}")
    print(f"Scanned TSV rows: {scanned:,}")
    print(f"Matched unique ISRCs in TSV: {len(found):,}")
    print(f"Not found in TSV: {len(target - seen):,}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
