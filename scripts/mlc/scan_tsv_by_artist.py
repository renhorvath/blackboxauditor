#!/usr/bin/env python3
"""Scan unmatched TSV for rows matching a Hungarian artist name (Jazzbois-style)."""

from __future__ import annotations

import argparse
import csv
import re
import subprocess
import unicodedata
from collections import Counter
from pathlib import Path

from paths import data_dir, tsv_path

MIN_FIELDS = 20
EXPORT_HEADER = [
    "tsv_line",
    "UnmatchedResourceRecordId",
    "ResourceType",
    "ISRC",
    "DspResourceId",
    "ResourceTitle",
    "DisplayArtistName",
    "Duration",
    "ReleaseRecordId",
    "OriginalDataProviderName",
]
VALIDATED_CSV = data_dir() / "hu_100_artists_validated.csv"


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = value.encode("ascii", "ignore").decode("ascii")
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_").lower()
    return value or "artist"


def normalize(value: str) -> str:
    value = (value or "").strip().upper()
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = re.sub(r"[^A-Z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def split_artist_segments(artist: str) -> list[str]:
    parts = re.split(r"[,/&]| FEAT\.? | FEAT | VS\.? | X ", artist.upper())
    return [normalize(part) for part in parts if normalize(part)]


def artist_matches(artist: str, terms: list[str], match_mode: str) -> bool:
    if not artist.strip():
        return False
    segments = split_artist_segments(artist)
    full = normalize(artist)
    for term in terms:
        nt = normalize(term)
        if not nt:
            continue
        if match_mode == "exact":
            if any(seg == nt for seg in segments) or full == nt:
                return True
            continue
        if any(seg == nt or nt in seg for seg in segments):
            return True
        if full == nt or nt in full:
            return True
    return False


def classify_match(artist: str, terms: list[str], match_mode: str) -> str:
    primary = normalize(terms[0])
    artist_norm = normalize(artist)
    segments = split_artist_segments(artist)

    if artist_norm == primary:
        return "solo_exact"

    matching_segments = [seg for seg in segments if seg == primary]
    if matching_segments:
        if len(segments) == 1:
            return "solo_exact"
        return "segment_collab"

    if match_mode == "collab":
        if artist_matches(artist, terms, match_mode):
            return "contains_collab"
    return "other"


def load_validated_row(index: int | None, query_name: str | None) -> dict[str, str]:
    with open(VALIDATED_CSV, "r", encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))
    if query_name:
        for row in rows:
            if row.get("query_name", "").strip().lower() == query_name.strip().lower():
                return row
        raise SystemExit(f"Unknown query_name in validated list: {query_name}")
    if index is None:
        raise SystemExit("Provide --index or --name")
    if index < 1 or index > len(rows):
        raise SystemExit(f"--index must be 1..{len(rows)}")
    return rows[index - 1]


def build_terms(query_name: str, tsv_search_name: str) -> list[str]:
    terms: list[str] = []
    for value in (tsv_search_name, query_name):
        value = value.strip()
        if value and value not in terms:
            terms.append(value)
    return terms


def run_rg(tsv: Path, terms: list[str], hits_path: Path) -> None:
    args = ["rg", "-i", "-n", "--no-heading"]
    for term in terms:
        args.extend(["-e", term])
    args.append(str(tsv))
    with hits_path.open("w", encoding="utf-8") as out:
        proc = subprocess.run(args, stdout=out, stderr=subprocess.PIPE, text=True, check=False)
    if proc.returncode not in (0, 1):
        raise SystemExit(proc.stderr.strip() or f"rg failed with exit {proc.returncode}")


def parse_hit_line(line: str) -> tuple[str, list[str]] | None:
    if ":" not in line:
        return None
    tsv_line, content = line.split(":", 1)
    parts = content.split("\t")
    if len(parts) < MIN_FIELDS:
        return None
    return tsv_line, parts


def scan_artist(
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
    hits_path = out_dir / f"{slug}_hits.tsv"
    export_path = out_dir / f"{slug}_mlc_export.csv"
    summary_path = out_dir / f"{slug}_summary.txt"

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
                    joined = "\t".join(row)
                    raw_lines.append(f"{line_no}:{joined}")

    rows_out: list[list[str]] = []
    solo_exact = segment_collab = contains_collab = dropped = 0
    isrcs: set[str] = set()
    artist_variants: Counter[str] = Counter()
    match_kinds: Counter[str] = Counter()
    providers: Counter[str] = Counter()
    hu_rows = 0

    for line in raw_lines:
        parsed = parse_hit_line(line)
        if not parsed:
            dropped += 1
            continue
        tsv_line, parts = parsed
        artist = parts[8]
        if not artist_matches(artist, terms, match_mode):
            dropped += 1
            continue

        isrc = parts[2].strip()
        provider = parts[16].strip() if len(parts) > 16 else ""
        match_kind = classify_match(artist, terms, match_mode)
        if match_kind == "solo_exact":
            solo_exact += 1
        elif match_kind == "segment_collab":
            segment_collab += 1
        elif match_kind == "contains_collab":
            contains_collab += 1
        match_kinds[match_kind] += 1

        is_hu = isrc.upper().startswith("HU")
        if is_hu:
            hu_rows += 1
        if isrc:
            isrcs.add(isrc)
        artist_variants[artist] += 1
        providers[provider] += 1

        rows_out.append(
            [
                tsv_line,
                parts[0].lstrip("#"),
                parts[1],
                isrc,
                parts[3],
                parts[4],
                artist,
                parts[12] if len(parts) > 12 else "",
                parts[13] if len(parts) > 13 else "",
                provider,
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
        f"solo_exact_rows: {solo_exact}",
        f"segment_collab_rows: {segment_collab}",
        f"contains_collab_rows: {contains_collab}",
        f"hu_prefix_rows: {hu_rows}",
        "",
        "Match kinds:",
    ]
    for name, count in match_kinds.most_common():
        summary_lines.append(f"  {count:4d}  {name}")
    summary_lines.extend(["", "Top artist variants (DisplayArtistName):"])
    for name, count in artist_variants.most_common(15):
        summary_lines.append(f"  {count:4d}  {name}")
    summary_lines.append("")
    summary_lines.append("Providers:")
    for name, count in providers.most_common():
        summary_lines.append(f"  {count:4d}  {name}")

    summary_path.write_text("\n".join(summary_lines) + "\n", encoding="utf-8")

    return {
        "slug": slug,
        "query_name": query_name,
        "rows": len(rows_out),
        "unique_isrcs": len(isrcs),
        "solo_exact_rows": solo_exact,
        "segment_collab_rows": segment_collab,
        "contains_collab_rows": contains_collab,
        "hu_prefix_rows": hu_rows,
        "hits_path": str(hits_path),
        "export_path": str(export_path),
        "summary_path": str(summary_path),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Scan unmatched TSV for one artist name")
    parser.add_argument("--name", help="query_name from validated CSV")
    parser.add_argument("--index", type=int, help="1-based row in validated CSV")
    parser.add_argument("--tsv", default=str(tsv_path()))
    parser.add_argument(
        "--out-dir",
        default=str(data_dir() / "hu_artist_scans"),
        help="Output directory (per-artist subfolder created)",
    )
    parser.add_argument(
        "--match-mode",
        choices=("collab", "exact"),
        default="collab",
        help="collab=artist segment contains term (Jazzbois-style); exact=solo credit only",
    )
    parser.add_argument(
        "--from-hits",
        help="Reuse existing *_hits.tsv instead of running rg again",
    )
    parser.add_argument(
        "--no-rg",
        action="store_true",
        help="Stream TSV in Python instead of ripgrep prefilter",
    )
    args = parser.parse_args()

    row = load_validated_row(args.index, args.name)
    query_name = row["query_name"].strip()
    tsv_search_name = (row.get("tsv_search_name") or query_name).strip()
    slug = slugify(query_name)

    stats = scan_artist(
        query_name=query_name,
        tsv_search_name=tsv_search_name,
        tsv=Path(args.tsv),
        out_dir=Path(args.out_dir) / slug,
        use_rg=not args.no_rg,
        match_mode=args.match_mode,
        from_hits=Path(args.from_hits) if args.from_hits else None,
    )

    print(f"Artist: {query_name} → search as {tsv_search_name!r} ({args.match_mode})")
    print(f"Matched rows: {stats['rows']:,}")
    print(f"Unique ISRCs: {stats['unique_isrcs']:,}")
    print(
        f"solo_exact: {stats['solo_exact_rows']:,} | "
        f"segment_collab: {stats['segment_collab_rows']:,} | "
        f"contains_collab: {stats['contains_collab_rows']:,}"
    )
    print(f"HU-prefix rows: {stats['hu_prefix_rows']:,}")
    print(f"Export: {stats['export_path']}")
    print(f"Summary: {stats['summary_path']}")


if __name__ == "__main__":
    main()
