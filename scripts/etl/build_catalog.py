#!/usr/bin/env python3
"""Build DuckDB catalog from Parquet files."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import duckdb

from config import SOURCES, SourceSpec
from catalog_paths import catalog_db_path, load_dotenv_local, parquet_dir, source_parquet

load_dotenv_local()


def register_table(con: duckdb.DuckDBPyConnection, spec: SourceSpec, parquet: Path) -> None:
    if not parquet.is_file():
        raise SystemExit(f"Missing parquet for {spec.id}: {parquet}\nRun: npm run etl:parquet -- --source {spec.id}")

    con.execute(f"DROP TABLE IF EXISTS {spec.table_name}")
    con.execute(
        f"""
        CREATE TABLE {spec.table_name} AS
        SELECT * FROM read_parquet(?)
        """,
        [str(parquet)],
    )
    row_count = con.execute(f"SELECT count(*) FROM {spec.table_name}").fetchone()[0]
    print(f"  {spec.table_name}: {row_count:,} rows")


def build_catalog(*, sources: list[str] | None = None) -> Path:
    db_path = catalog_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if db_path.is_file():
        db_path.unlink()

    target_specs = [SOURCES[s] for s in sources] if sources else list(SOURCES.values())

    print(f"Building catalog: {db_path}")
    started = time.time()
    con = duckdb.connect(str(db_path))

    for spec in target_specs:
        register_table(con, spec, source_parquet(spec))

    # Convenience views for artist / ISRC search (case-insensitive contains).
    if "unmatched" in {s.id for s in target_specs}:
        con.execute(
            """
            CREATE OR REPLACE VIEW v_mlc_unmatched_by_artist AS
            SELECT *
            FROM mlc_unmatched
            WHERE DisplayArtistName IS NOT NULL
            """
        )
    if "unclaimed" in {s.id for s in target_specs}:
        con.execute(
            """
            CREATE OR REPLACE VIEW v_mlc_unclaimed_by_artist AS
            SELECT *
            FROM mlc_unclaimed
            WHERE DisplayArtistName IS NOT NULL
            """
        )

    con.close()
    elapsed = time.time() - started
    size_mb = db_path.stat().st_size / (1024**2)
    print(f"Catalog ready in {elapsed:.1f}s ({size_mb:.0f} MB)")
    return db_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Build DuckDB catalog from Parquet")
    parser.add_argument(
        "--source",
        choices=[*SOURCES.keys(), "all"],
        default="all",
        help="Which parquet tables to include (default: all)",
    )
    args = parser.parse_args()
    sources = None if args.source == "all" else [args.source]
    print(f"Parquet dir: {parquet_dir()}")
    build_catalog(sources=sources)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
