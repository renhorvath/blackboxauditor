#!/usr/bin/env python3
"""
Stream MLC TSV → Parquet (column subset) via DuckDB.

One-time import per machine; afterwards use build_catalog.py and query.py.
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import duckdb

from config import SOURCES, SourceSpec
from paths import load_dotenv_local, parquet_dir, source_parquet, source_tsv

load_dotenv_local()


def column_select_list(spec: SourceSpec) -> str:
    return ", ".join(f'"{c}"' for c in spec.columns)


def convert_source(spec: SourceSpec, *, force: bool = False) -> Path:
    tsv = source_tsv(spec)
    out = source_parquet(spec)
    out.parent.mkdir(parents=True, exist_ok=True)

    if out.is_file() and not force:
        print(f"Skip {spec.id}: {out} already exists (use --force to rebuild)")
        return out

    if not tsv.is_file():
        raise SystemExit(f"TSV not found for {spec.id}: {tsv}")

    size_gb = tsv.stat().st_size / (1024**3)
    print(f"Converting {spec.label}")
    print(f"  input:  {tsv} ({size_gb:.1f} GB)")
    print(f"  output: {out}")
    print(f"  columns: {', '.join(spec.columns)}")

    started = time.time()
    con = duckdb.connect()
    cols = column_select_list(spec)
    # BWARM files use # prefix on header row; tab-delimited.
    sql = f"""
        COPY (
            SELECT {cols}
            FROM read_csv(
                ?,
                delim='\\t',
                header=true,
                comment='#',
                ignore_errors=true,
                parallel=true
            )
        )
        TO ? (FORMAT PARQUET, COMPRESSION ZSTD)
    """
    con.execute(sql, [str(tsv), str(out)])
    con.close()

    elapsed = time.time() - started
    out_gb = out.stat().st_size / (1024**3)
    print(f"Done in {elapsed / 60:.1f} min → {out_gb:.2f} GB parquet")
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="MLC TSV → Parquet (DuckDB)")
    parser.add_argument(
        "--source",
        choices=[*SOURCES.keys(), "all"],
        default="all",
        help="Which TSV to convert (default: all)",
    )
    parser.add_argument("--force", action="store_true", help="Rebuild even if parquet exists")
    args = parser.parse_args()

    targets = list(SOURCES.values()) if args.source == "all" else [SOURCES[args.source]]
    print(f"Parquet dir: {parquet_dir()}")

    for spec in targets:
        convert_source(spec, force=args.force)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
