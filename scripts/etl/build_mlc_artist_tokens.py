#!/usr/bin/env python3
"""Build artist token lookup tables for fast MLC artist search (avoids 845M-row ILIKE scans)."""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import duckdb

from catalog_paths import catalog_db_path, load_dotenv_local

load_dotenv_local()

# Hash buckets keep each pass under RAM; minimal (token, isrc) schema avoids wide DISTINCT sorts.
BUCKETS = 40

TOKEN_SPECS: dict[str, tuple[str, str, str]] = {
    "unmatched": ("mlc_unmatched", "mlc_unmatched_artist_tokens", "mlc_unmatched"),
    "unclaimed": ("mlc_unclaimed", "mlc_unclaimed_artist_tokens", "mlc_unclaimed"),
}


def table_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    row = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = ?",
        [name],
    ).fetchone()
    return bool(row and row[0] > 0)


def configure_duckdb(con: duckdb.DuckDBPyConnection, db: Path) -> None:
    tmp = db.parent / "catalog.duckdb.tmp"
    tmp.mkdir(exist_ok=True)
    con.execute("SET preserve_insertion_order=false")
    con.execute("SET threads=4")
    con.execute("SET memory_limit='16GB'")
    con.execute(f"SET temp_directory='{tmp}'")


def token_rows_sql(source: str, *, bucket: int | None = None) -> str:
    bucket_filter = ""
    if bucket is not None:
        bucket_filter = f" AND (hash(ISRC) % {BUCKETS}) = {bucket}"

    return f"""
    WITH seg AS (
      SELECT ISRC,
        unnest(string_split_regex(
          upper(COALESCE(DisplayArtistName, '')),
          '[,/&]| FEAT\\.? | FEAT | VS\\.? | X '
        )) AS raw_segment
      FROM {source}
      WHERE DisplayArtistName IS NOT NULL AND trim(DisplayArtistName) != ''{bucket_filter}
    ),
    words AS (
      SELECT ISRC,
        unnest(string_split_regex(
          regexp_replace(trim(raw_segment), '[^A-Z0-9]+', ' ', 'g'),
          '\\s+'
        )) AS token
      FROM seg
      WHERE trim(raw_segment) != ''
    )
    SELECT token, upper(trim(ISRC)) AS isrc
    FROM words
    WHERE token IS NOT NULL AND length(token) >= 2
    """


def build_token_table(con: duckdb.DuckDBPyConnection, source: str, dest: str) -> int:
    if not table_exists(con, source):
        raise SystemExit(f"Missing source table: {source}")

    print(f"  Building {dest} from {source} ({BUCKETS} buckets, token+isrc only) …", flush=True)
    con.execute(f"DROP TABLE IF EXISTS {dest}")
    try:
        con.execute(f"DROP INDEX IF EXISTS idx_{dest}_token")
    except duckdb.Error:
        pass

    con.execute(
        f"CREATE TABLE {dest} (token VARCHAR NOT NULL, isrc VARCHAR NOT NULL)"
    )
    for bucket in range(BUCKETS):
        started = time.time()
        print(f"    bucket {bucket + 1}/{BUCKETS} …", flush=True)
        con.execute(f"INSERT INTO {dest} {token_rows_sql(source, bucket=bucket)}")
        elapsed = time.time() - started
        partial = con.execute(f"SELECT count(*) FROM {dest}").fetchone()[0]
        print(
            f"    bucket {bucket + 1}/{BUCKETS} done in {elapsed:.0f}s ({partial:,} rows so far)",
            flush=True,
        )

    print("    creating index on token …", flush=True)
    con.execute(f"CREATE INDEX idx_{dest}_token ON {dest}(token)")
    count = con.execute(f"SELECT count(*) FROM {dest}").fetchone()[0]
    print(f"  {dest}: {count:,} token rows")
    return int(count)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build MLC artist token index tables in catalog.duckdb")
    parser.add_argument(
        "--source",
        choices=[*TOKEN_SPECS.keys(), "all"],
        default="all",
        help="Which MLC table to index (default: all)",
    )
    args = parser.parse_args()

    db = catalog_db_path()
    if not db.is_file():
        raise SystemExit(f"Catalog not found: {db}\nRun: npm run etl:catalog")

    keys = list(TOKEN_SPECS.keys()) if args.source == "all" else [args.source]
    started = time.time()
    print(f"Token index build: {db}")

    con = duckdb.connect(str(db))
    configure_duckdb(con, db)
    try:
        for key in keys:
            src, dest, _ = TOKEN_SPECS[key]
            build_token_table(con, src, dest)
    finally:
        con.close()

    elapsed = time.time() - started
    print(f"Done in {elapsed:.1f}s")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
