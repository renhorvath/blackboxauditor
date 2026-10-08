#!/usr/bin/env python3
"""Clean UCMR-ADA unidentified.csv titles/names spilled over from adjacent PDF columns.

pdftotext column wrapping leaks station type (Public/Cablu), quarter (Q4) and year into the
title cell, and sometimes doubles the title. Writes unidentified.clean.csv next to the input;
load with: UCMR_CSV_PATH=raw/cmo/ro-ucmr-ada/unidentified.clean.csv npm run cloudsql:load-ucmr
"""

from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

csv.field_size_limit(min(sys.maxsize, 20_000_000))

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "raw" / "cmo" / "ro-ucmr-ada" / "unidentified.csv"
DST = SRC.with_name("unidentified.clean.csv")

NOISE = re.compile(
    r"(?<!\w)(?:Public|Publica|Cablu|Comercial|Privat|Q[1-4]|20[12]\d|\(anonim\)|\(Anonim\))(?!\w)"
)
NAME_PLACEHOLDERS = {"neidentificat", "necunoscut", "anonim", "unknown", "n/a"}


def fix_mojibake(value: str) -> str:
    if "Ã" not in value and "Å" not in value:
        return value
    try:
        return value.encode("cp1252").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        return value


def squash(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" -/|·,;")


def dedupe_repeat(value: str) -> str:
    words = value.split()
    n = len(words)
    for size in range(1, n // 2 + 1):
        if n % size == 0 and words[:size] * (n // size) == words:
            return " ".join(words[:size])
    return value


def clean_title(title: str, performer: str) -> str:
    cleaned = dedupe_repeat(squash(NOISE.sub(" ", fix_mojibake(title))))
    if not cleaned or cleaned.casefold() == performer.casefold():
        return ""
    return cleaned


def clean_name(value: str) -> str:
    cleaned = squash(fix_mojibake(value))
    return "" if cleaned.casefold() in NAME_PLACEHOLDERS else cleaned


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC
    dst = src.with_name("unidentified.clean.csv")
    changed = emptied = total = 0
    with src.open(encoding="utf-8-sig", newline="") as fin, dst.open(
        "w", encoding="utf-8", newline=""
    ) as fout:
        reader = csv.DictReader(fin)
        writer = csv.DictWriter(fout, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            total += 1
            artist = clean_name(row.get("artist") or "")
            author = clean_name(row.get("author") or "")
            title_raw = row.get("title") or ""
            title = clean_title(title_raw, artist)
            if title != title_raw:
                changed += 1
                if not title:
                    emptied += 1
            row["title"] = title
            row["artist"] = artist
            row["author"] = author
            row["identification"] = " · ".join(p for p in (author, artist) if p)
            writer.writerow(row)
    print(f"Wrote {dst} — {total:,} rows, {changed:,} titles cleaned ({emptied:,} unreadable → empty)")


if __name__ == "__main__":
    main()
