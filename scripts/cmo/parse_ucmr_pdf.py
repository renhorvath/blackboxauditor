#!/usr/bin/env python3
"""UCMR-ADA monthly PDF → CSV for cmo:build-index (ro-ucmr-ada)."""

from __future__ import annotations

import argparse
import csv
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = PROJECT_ROOT / "raw" / "cmo" / "ro-ucmr-ada" / "unidentified.csv"


def parse_pdf_text(text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in text.splitlines():
        line = line.strip()
        if len(line) < 5:
            continue
        if re.match(r"^(nr|no|#|pagina|page)\b", line, re.I):
            continue
        parts = re.split(r"\s{2,}|\t", line)
        if len(parts) < 2:
            continue
        title = parts[0].strip()
        author = parts[1].strip() if len(parts) > 1 else ""
        artist = parts[2].strip() if len(parts) > 2 else author
        if not title:
            continue
        rows.append({"title": title, "author": author, "artist": artist})
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Parse UCMR-ADA PDF to CSV")
    parser.add_argument("pdf", type=Path, help="Input PDF path")
    parser.add_argument("-o", "--output", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    if not args.pdf.is_file():
        print(f"Missing PDF: {args.pdf}", file=sys.stderr)
        sys.exit(1)

    try:
        from pypdf import PdfReader
    except ImportError:
        print("Install pypdf: pip install pypdf", file=sys.stderr)
        sys.exit(1)

    reader = PdfReader(str(args.pdf))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    rows = parse_pdf_text(text)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["title", "author", "artist"])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Wrote {args.output} ({len(rows):,} rows)")


if __name__ == "__main__":
    main()
