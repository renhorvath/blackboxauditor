#!/usr/bin/env python3
"""Build ISRC lookup shards for fast token→row joins on MLC tables.

Monolithic CREATE INDEX on ~845M unmatched rows exceeds 16 GB RAM. We materialize
slim (isrc + display columns) hash buckets with a per-shard ISRC index — same
bucket count as the artist token build.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import duckdb

from catalog_paths import catalog_db_path, load_dotenv_local

load_dotenv_local()

PROGRESS_DIR = Path(__file__).resolve().parent.parent.parent / "derived" / "mlc-hu"

DEFAULT_BUCKETS: dict[str, int] = {
    "unmatched": 85,
    "unclaimed": 7,
}

# dest_prefix, source table, columns to keep for joins / export
SHARD_SPECS: dict[str, tuple[str, str, tuple[str, ...]]] = {
    "unmatched": (
        "mlc_unmatched_isrc",
        "mlc_unmatched",
        (
            "ISRC",
            "ResourceTitle",
            "DisplayArtistName",
            "OriginalDataProviderName",
            "ResourceType",
        ),
    ),
    "unclaimed": (
        "mlc_unclaimed_isrc",
        "mlc_unclaimed",
        (
            "ISRC",
            "ResourceTitle",
            "DisplayArtistName",
            "UnclaimedRightSharePercentage",
            "MusicalWorkRecordId",
            "DspResourceId",
        ),
    ),
}


def progress_path(dest: str) -> Path:
    PROGRESS_DIR.mkdir(parents=True, exist_ok=True)
    return PROGRESS_DIR / f"etl_{dest}_progress.json"


def load_progress(dest: str) -> dict | None:
    path = progress_path(dest)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def save_progress(dest: str, data: dict) -> None:
    progress_path(dest).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def table_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    row = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = ?",
        [name],
    ).fetchone()
    return bool(row and row[0] > 0)


def shard_table_name(dest: str, bucket: int) -> str:
    return f"{dest}_p{bucket}"


def list_shard_tables(con: duckdb.DuckDBPyConnection, dest: str) -> list[str]:
    prefix = f"{dest}_p"
    rows = con.execute(
        """
        SELECT table_name FROM information_schema.tables
        WHERE table_name LIKE ? || '%'
        """,
        [prefix],
    ).fetchall()
    tables = [r[0] for r in rows if r[0].startswith(prefix)]

    def part_num(name: str) -> int:
        return int(name[len(prefix) :])

    return sorted(tables, key=part_num)


def index_exists(con: duckdb.DuckDBPyConnection, index_name: str) -> bool:
    row = con.execute(
        "SELECT count(*) FROM duckdb_indexes() WHERE lower(index_name) = lower(?)",
        [index_name],
    ).fetchone()
    return bool(row and row[0] > 0)


def configure_duckdb(con: duckdb.DuckDBPyConnection, db: Path) -> None:
    tmp = db.parent / "catalog.duckdb.tmp"
    tmp.mkdir(exist_ok=True)
    mem = os.environ.get("DUCKDB_MEMORY_LIMIT", "12GB").strip() or "12GB"
    threads = os.environ.get("DUCKDB_THREADS", "1").strip() or "1"
    con.execute("SET preserve_insertion_order=false")
    con.execute(f"SET threads={threads}")
    con.execute(f"SET memory_limit='{mem}'")
    con.execute(f"SET temp_directory='{tmp}'")


def drop_shards(con: duckdb.DuckDBPyConnection, dest: str, buckets: int) -> None:
    for bucket in range(buckets):
        tbl = shard_table_name(dest, bucket)
        if table_exists(con, tbl):
            con.execute(f"DROP TABLE {tbl}")
        idx = f"idx_{tbl}_isrc"
        try:
            con.execute(f"DROP INDEX IF EXISTS {idx}")
        except duckdb.Error:
            pass


def bucket_select_sql(
    source: str,
    columns: tuple[str, ...],
    *,
    bucket: int,
    buckets: int,
) -> str:
    cols = ", ".join(columns)
    return f"""
    SELECT {cols}
    FROM {source}
    WHERE ISRC IS NOT NULL AND trim(ISRC) != ''
      AND (hash(ISRC) % {buckets}) = {bucket}
    """


def build_shards(
    con: duckdb.DuckDBPyConnection,
    dest: str,
    source: str,
    columns: tuple[str, ...],
    *,
    buckets: int,
    fresh: bool,
) -> dict:
    if not table_exists(con, source):
        raise SystemExit(f"Missing source table: {source}")

    progress = load_progress(dest)
    if fresh:
        print(f"  Fresh build: dropping {dest}_p* shards …", flush=True)
        drop_shards(con, dest, buckets)
        prog = progress_path(dest)
        if prog.is_file():
            prog.unlink()
        progress = None

    if progress and progress.get("indexed") and progress.get("buckets") == buckets:
        shards = list_shard_tables(con, dest)
        if len(shards) >= buckets:
            total = sum(
                con.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in shards
            )
            print(f"  {dest} already complete ({len(shards)} shards, {total:,} rows)", flush=True)
            return progress

    completed: list[int] = []
    if progress and progress.get("buckets") == buckets and not fresh:
        completed = sorted(int(b) for b in progress.get("completed_buckets", []))

    start_bucket = 0
    if completed:
        start_bucket = max(completed) + 1
        if start_bucket >= buckets:
            start_bucket = buckets
        else:
            print(
                f"  Resuming {dest} from bucket {start_bucket + 1}/{buckets} "
                f"({len(completed)} buckets done) …",
                flush=True,
            )
    else:
        row_count = con.execute(f"SELECT count(*) FROM {source}").fetchone()[0]
        print(
            f"  Building {dest} from {source} ({row_count:,} rows, {buckets} shards) …",
            flush=True,
        )

    for bucket in range(start_bucket, buckets):
        tbl = shard_table_name(dest, bucket)
        started = time.time()
        print(f"    shard {bucket + 1}/{buckets} ({tbl}) …", flush=True)
        con.execute(f"DROP TABLE IF EXISTS {tbl}")
        con.execute(
            f"CREATE TABLE {tbl} AS {bucket_select_sql(source, columns, bucket=bucket, buckets=buckets)}"
        )
        idx = f"idx_{tbl}_isrc"
        if not index_exists(con, idx):
            con.execute(f"CREATE INDEX {idx} ON {tbl}(ISRC)")
        shard_rows = con.execute(f"SELECT count(*) FROM {tbl}").fetchone()[0]
        elapsed = time.time() - started
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
                "last_shard_rows": int(shard_rows),
                "last_bucket_seconds": round(elapsed, 1),
                "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            },
        )
        print(
            f"    shard {bucket + 1}/{buckets} done in {elapsed:.0f}s ({shard_rows:,} rows)",
            flush=True,
        )

    shards = list_shard_tables(con, dest)
    total = sum(con.execute(f"SELECT count(*) FROM {t}").fetchone()[0] for t in shards)
    payload = {
        "dest": dest,
        "source": source,
        "buckets": buckets,
        "completed_buckets": list(range(buckets)),
        "indexed": True,
        "row_count": int(total),
        "shard_count": len(shards),
        "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    save_progress(dest, payload)
    print(f"  {dest}: {len(shards)} shards, {total:,} lookup rows", flush=True)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build ISRC lookup shards on MLC DuckDB tables")
    parser.add_argument(
        "--table",
        choices=[*SHARD_SPECS.keys(), "all"],
        default="unmatched",
        help="Which MLC table to shard (default: unmatched)",
    )
    parser.add_argument(
        "--buckets",
        type=int,
        help="Hash buckets (default: 85 unmatched, 7 unclaimed)",
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help="Drop existing shards and progress; start from bucket 0",
    )
    args = parser.parse_args()

    db = catalog_db_path()
    if not db.is_file():
        raise SystemExit(f"Catalog not found: {db}\nRun: npm run etl:catalog")

    keys = list(SHARD_SPECS.keys()) if args.table == "all" else [args.table]
    print(f"ISRC shard build: {db}", flush=True)
    started = time.time()

    con = duckdb.connect(str(db))
    configure_duckdb(con, db)
    try:
        for key in keys:
            dest, source, columns = SHARD_SPECS[key]
            buckets = args.buckets if args.buckets else DEFAULT_BUCKETS[key]
            build_shards(
                con,
                dest,
                source,
                columns,
                buckets=buckets,
                fresh=args.fresh,
            )
    finally:
        con.close()

    print(f"Done in {time.time() - started:.1f}s", flush=True)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted — progress saved; rerun to resume", flush=True)
        sys.exit(130)
