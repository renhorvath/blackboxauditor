#!/usr/bin/env python3
"""Build artist token lookup tables for fast MLC artist search (avoids 845M-row ILIKE scans)."""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import duckdb

from catalog_paths import catalog_db_path, load_dotenv_local

load_dotenv_local()

# Hash buckets keep each pass under RAM; minimal (token, isrc) schema avoids wide DISTINCT sorts.
DEFAULT_BUCKETS: dict[str, int] = {
    "unmatched": 85,   # ~845M rows ≈ 10M source rows per bucket
    "unclaimed": 7,    # ~68M rows ≈ 10M per bucket
}

TOKEN_SPECS: dict[str, tuple[str, str, str]] = {
    "unmatched": ("mlc_unmatched", "mlc_unmatched_artist_tokens", "mlc_unmatched"),
    "unclaimed": ("mlc_unclaimed", "mlc_unclaimed_artist_tokens", "mlc_unclaimed"),
}

PROGRESS_DIR = Path(__file__).resolve().parent.parent.parent / "derived" / "mlc-hu"


def progress_path(dest: str) -> Path:
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
    return PROGRESS_DIR / f"etl_{dest}_progress.json"


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


def token_rows_sql(source: str, *, bucket: int | None = None, buckets: int = 40) -> str:
    bucket_filter = ""
    if bucket is not None:
        bucket_filter = f" AND (hash(ISRC) % {buckets}) = {bucket}"

    return f"""
    WITH seg AS (
      SELECT ISRC,
        unnest(string_split_regex(
          upper(COALESCE(DisplayArtistName, '')),
          '[,/&]| FEAT\\.? | FEAT | VS\\.? | X '
        )) AS raw_segment
      FROM {source}
      WHERE DisplayArtistName IS NOT NULL AND trim(DisplayArtistName) != ''
        AND ISRC IS NOT NULL AND trim(ISRC) != ''{bucket_filter}
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


def load_progress(dest: str) -> dict | None:
    path = progress_path(dest)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def save_progress(dest: str, data: dict) -> None:
    path = progress_path(dest)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def drop_token_table(con: duckdb.DuckDBPyConnection, dest: str) -> None:
    con.execute(f"DROP TABLE IF EXISTS {dest}")
    try:
        con.execute(f"DROP INDEX IF EXISTS idx_{dest}_token")
    except duckdb.Error:
        pass
    prog = progress_path(dest)
    if prog.is_file():
        prog.unlink()


def ensure_token_table(con: duckdb.DuckDBPyConnection, dest: str) -> None:
    if not table_exists(con, dest):
        con.execute(
            f"CREATE TABLE {dest} (token VARCHAR NOT NULL, isrc VARCHAR NOT NULL)"
        )


def build_token_table(
    con: duckdb.DuckDBPyConnection,
    source: str,
    dest: str,
    *,
    buckets: int,
    fresh: bool,
    from_bucket: int | None,
) -> int:
    if not table_exists(con, source):
        raise SystemExit(f"Missing source table: {source}")

    progress = load_progress(dest)
    start_bucket = 0

    if fresh:
        print(f"  Fresh build: dropping {dest} …", flush=True)
        drop_token_table(con, dest)
        progress = None
    elif progress and progress.get("indexed"):
        count = con.execute(f"SELECT count(*) FROM {dest}").fetchone()[0]
        print(f"  {dest} already complete ({count:,} rows, indexed)", flush=True)
        return int(count)
    elif progress and progress.get("buckets") == buckets:
        done = set(progress.get("completed_buckets", []))
        if len(done) >= buckets:
            start_bucket = buckets
        else:
            start_bucket = max(done) + 1 if done else 0
            print(
                f"  Resuming {dest} from bucket {start_bucket + 1}/{buckets} "
                f"({len(done)} buckets already done) …",
                flush=True,
            )
    elif from_bucket is not None:
        start_bucket = from_bucket
        print(f"  Starting {dest} from bucket {start_bucket + 1}/{buckets} …", flush=True)
    elif table_exists(con, dest) and not progress:
        print(
            f"  WARNING: {dest} exists without progress file — use --fresh or --resume",
            flush=True,
        )
        raise SystemExit(1)
    else:
        print(f"  Building {dest} from {source} ({buckets} buckets, token+isrc only) …", flush=True)

    if start_bucket >= buckets:
        if not progress or not progress.get("indexed"):
            print("    creating index on token …", flush=True)
            try:
                con.execute(f"CREATE INDEX idx_{dest}_token ON {dest}(token)")
            except duckdb.Error as err:
                if "already exists" not in str(err).lower():
                    raise
            count = con.execute(f"SELECT count(*) FROM {dest}").fetchone()[0]
            save_progress(
                dest,
                {
                    "dest": dest,
                    "source": source,
                    "buckets": buckets,
                    "completed_buckets": list(range(buckets)),
                    "indexed": True,
                    "row_count": count,
                    "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
            )
            print(f"  {dest}: {count:,} token rows (indexed)")
            return int(count)
        count = con.execute(f"SELECT count(*) FROM {dest}").fetchone()[0]
        return int(count)

    ensure_token_table(con, dest)
    completed: list[int] = list(progress.get("completed_buckets", [])) if progress else []

    for bucket in range(start_bucket, buckets):
        started = time.time()
        print(f"    bucket {bucket + 1}/{buckets} …", flush=True)
        con.execute(
            f"INSERT INTO {dest} {token_rows_sql(source, bucket=bucket, buckets=buckets)}"
        )
        elapsed = time.time() - started
        partial = con.execute(f"SELECT count(*) FROM {dest}").fetchone()[0]
        if bucket not in completed:
            completed.append(bucket)
        save_progress(
            dest,
            {
                "dest": dest,
                "source": source,
                "buckets": buckets,
                "completed_buckets": sorted(completed),
                "indexed": False,
                "row_count": partial,
                "last_bucket_seconds": round(elapsed, 1),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        )
        print(
            f"    bucket {bucket + 1}/{buckets} done in {elapsed:.0f}s ({partial:,} rows so far)",
            flush=True,
        )

    print("    creating index on token …", flush=True)
    t0 = time.time()
    try:
        con.execute(f"DROP INDEX IF EXISTS idx_{dest}_token")
    except duckdb.Error:
        pass
    con.execute(f"CREATE INDEX idx_{dest}_token ON {dest}(token)")
    index_seconds = time.time() - t0
    count = con.execute(f"SELECT count(*) FROM {dest}").fetchone()[0]
    save_progress(
        dest,
        {
            "dest": dest,
            "source": source,
            "buckets": buckets,
            "completed_buckets": list(range(buckets)),
            "indexed": True,
            "row_count": count,
            "index_seconds": round(index_seconds, 1),
            "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    )
    print(f"  {dest}: {count:,} token rows (index built in {index_seconds:.0f}s)")
    return int(count)


def main() -> None:
    parser = argparse.ArgumentParser(description="Build MLC artist token index tables in catalog.duckdb")
    parser.add_argument(
        "--source",
        choices=[*TOKEN_SPECS.keys(), "all"],
        default="all",
        help="Which MLC table to index (default: all)",
    )
    parser.add_argument(
        "--buckets",
        type=int,
        help="Hash buckets (default: 85 unmatched, 7 unclaimed ≈10M rows/bucket)",
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Drop existing token table and progress; start from bucket 0",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from progress file (default when progress exists)",
    )
    parser.add_argument(
        "--from-bucket",
        type=int,
        metavar="N",
        help="Start at bucket N (0-based); keeps existing table rows",
    )
    args = parser.parse_args()

    db = catalog_db_path()
    if not db.is_file():
        raise SystemExit(f"Catalog not found: {db}\nRun: npm run etl:catalog")

    keys = list(TOKEN_SPECS.keys()) if args.source == "all" else [args.source]
    started = time.time()
    print(f"Token index build: {db}", flush=True)

    con = duckdb.connect(str(db))
    configure_duckdb(con, db)
    try:
        for key in keys:
            src, dest, _ = TOKEN_SPECS[key]
            buckets = args.buckets if args.buckets else DEFAULT_BUCKETS[key]
            fresh = args.fresh
            from_bucket = args.from_bucket
            if args.resume and not fresh and from_bucket is None:
                pass  # build_token_table auto-resumes from progress
            elif not fresh and from_bucket is None and load_progress(dest):
                pass  # auto-resume
            build_token_table(
                con,
                src,
                dest,
                buckets=buckets,
                fresh=fresh,
                from_bucket=from_bucket,
            )
    finally:
        con.close()

    elapsed = time.time() - started
    print(f"Done in {elapsed:.1f}s", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted — progress saved; rerun with --resume", flush=True)
        sys.exit(130)
