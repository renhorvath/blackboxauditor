#!/usr/bin/env python3
"""Convert Artisjus azonosítatlan művek PDF to CSV (one row per listing line, no dedup)."""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
import sys
import time
from pathlib import Path

from paths import data_dir, load_dotenv_local

DEFAULT_PDF = Path("/Users/ren/Downloads/2025_Azonositatlan_muvek_2025.pdf")
DEFAULT_OUTPUT = "artisjus_azonositatlan_muvek.csv"

LABELS = [
    "Ssz.",
    "Műkód",
    "Műcím",
    "Előadók",
    "Jogosultak",
    "Zeneműkiadó(k)",
    "Hangfelvételkiadók",
    "Felo.tip",
    "Elhangzási információk",
]
FIELDS = [
    "ssz",
    "mukod",
    "mucim",
    "eloadok",
    "jogosultak",
    "zenemu_kiado",
    "hangfelvetel_kiado",
    "felo_tip",
    "elhangzasi_info",
]
MUKOD_RE = re.compile(r"^(\d+)\s+(400\d{7})\s")
PAGE_RE = re.compile(r"(?=Azonosítatlan művek weblapra \d+\. oldal\n)")


def col_bounds(header: str) -> list[int]:
    positions = [header.find(label) for label in LABELS]
    positions.append(len(header) + 500)
    return positions


def slice_col(line: str, start: int, end: int) -> str:
    if start >= len(line):
        return ""
    chunk = line[start:end] if end <= len(line) else line[start:]
    return chunk.rstrip()


def parse_page(page: str) -> list[dict[str, str]]:
    lines = page.splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if "Ssz." in line and "Műkód" in line and "Műcím" in line:
            header_idx = i
            break
    if header_idx is None:
        return []

    bounds = col_bounds(lines[header_idx])
    rows: list[dict[str, str]] = []
    current: dict[str, str] | None = None

    for line in lines[header_idx + 1 :]:
        if not line.strip():
            continue
        match = MUKOD_RE.match(line)
        if match:
            if current:
                rows.append(current)
            current = {"ssz": match.group(1), "mukod": match.group(2)}
            for j, key in enumerate(FIELDS):
                if j < 2:
                    continue
                current[key] = slice_col(line, bounds[j], bounds[j + 1]).strip()
        elif current is not None:
            for j, key in enumerate(FIELDS):
                if j < 2:
                    continue
                value = slice_col(line, bounds[j], bounds[j + 1]).strip()
                if value:
                    prev = current.get(key, "")
                    current[key] = f"{prev} {value}".strip() if prev else value

    if current:
        rows.append(current)
    return rows


def extract_layout_text(pdf_path: Path, text_path: Path) -> None:
    text_path.parent.mkdir(parents=True, exist_ok=True)
    print(f"Extracting layout text from {pdf_path} …", flush=True)
    started = time.perf_counter()
    subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), str(text_path)],
        check=True,
    )
    elapsed = time.perf_counter() - started
    size_mb = text_path.stat().st_size / (1024 * 1024)
    print(f"  → {text_path} ({size_mb:.0f} MB) in {elapsed:.1f}s", flush=True)


def iter_rows(text_path: Path):
    text = text_path.read_text(encoding="utf-8", errors="replace")
    pages = [part for part in PAGE_RE.split(text) if part.strip()]
    print(f"Parsing {len(pages):,} pages …", flush=True)
    started = time.perf_counter()
    total = 0
    for page in pages:
        for row in parse_page(page):
            total += 1
            yield row
    print(f"  → {total:,} rows in {time.perf_counter() - started:.1f}s", flush=True)


def write_csv(rows, output_path: Path) -> int:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in FIELDS})
            count += 1
    return count


def main() -> int:
    load_dotenv_local()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", type=Path, default=DEFAULT_PDF, help="Source PDF path")
    parser.add_argument(
        "--text-file",
        type=Path,
        help="Use existing pdftotext -layout output (skip PDF extraction)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help=f"Output CSV path (default: {DEFAULT_OUTPUT} in MLC_HU_DATA_DIR)",
    )
    args = parser.parse_args()

    output_path = args.output or (data_dir() / DEFAULT_OUTPUT)
    text_path = args.text_file

    if text_path is None:
        if not args.pdf.is_file():
            print(f"Missing PDF: {args.pdf}", file=sys.stderr)
            return 1
        text_path = output_path.with_suffix(".layout.txt")
        if not text_path.is_file() or text_path.stat().st_mtime < args.pdf.stat().st_mtime:
            extract_layout_text(args.pdf, text_path)
        else:
            print(f"Reusing layout text: {text_path}", flush=True)
    elif not text_path.is_file():
        print(f"Missing text file: {text_path}", file=sys.stderr)
        return 1

    started = time.perf_counter()
    count = write_csv(iter_rows(text_path), output_path)
    size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"Wrote {count:,} rows → {output_path} ({size_mb:.0f} MB) in {time.perf_counter() - started:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
