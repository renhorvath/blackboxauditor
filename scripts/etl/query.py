#!/usr/bin/env python3
"""Query DuckDB catalog by artist name or ISRC."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import duckdb

from config import SOURCES
from paths import catalog_db_path, load_dotenv_local

load_dotenv_local()


def search_artist(con: duckdb.DuckDBPyConnection, name: str, *, limit: int) -> dict:
    term = f"%{name.strip()}%"
    results: dict = {"artist": name, "unmatched": [], "unclaimed": []}

    if table_exists(con, "mlc_unmatched"):
        rows = con.execute(
            """
            SELECT ISRC, ResourceTitle, DisplayArtistName, OriginalDataProviderName, ResourceType
            FROM mlc_unmatched
            WHERE DisplayArtistName ILIKE ?
            LIMIT ?
            """,
            [term, limit],
        ).fetchall()
        results["unmatched"] = [
            {
                "isrc": r[0],
                "title": r[1],
                "artist": r[2],
                "provider": r[3],
                "resourceType": r[4],
            }
            for r in rows
        ]

    if table_exists(con, "mlc_unclaimed"):
        rows = con.execute(
            """
            SELECT ISRC, ResourceTitle, DisplayArtistName,
                   UnclaimedRightSharePercentage, MusicalWorkRecordId
            FROM mlc_unclaimed
            WHERE DisplayArtistName ILIKE ?
            LIMIT ?
            """,
            [term, limit],
        ).fetchall()
        results["unclaimed"] = [
            {
                "isrc": r[0],
                "title": r[1],
                "artist": r[2],
                "unclaimedPct": r[3],
                "workRecordId": r[4],
            }
            for r in rows
        ]

    return results


def search_isrc(con: duckdb.DuckDBPyConnection, isrc: str, *, limit: int) -> dict:
    key = isrc.strip().upper()
    results: dict = {"isrc": key, "unmatched": [], "unclaimed": []}

    if table_exists(con, "mlc_unmatched"):
        rows = con.execute(
            """
            SELECT ISRC, ResourceTitle, DisplayArtistName, OriginalDataProviderName, ResourceType
            FROM mlc_unmatched
            WHERE upper(ISRC) = ?
            LIMIT ?
            """,
            [key, limit],
        ).fetchall()
        results["unmatched"] = [
            {
                "isrc": r[0],
                "title": r[1],
                "artist": r[2],
                "provider": r[3],
                "resourceType": r[4],
            }
            for r in rows
        ]

    if table_exists(con, "mlc_unclaimed"):
        rows = con.execute(
            """
            SELECT ISRC, ResourceTitle, DisplayArtistName,
                   UnclaimedRightSharePercentage, MusicalWorkRecordId
            FROM mlc_unclaimed
            WHERE upper(ISRC) = ?
            LIMIT ?
            """,
            [key, limit],
        ).fetchall()
        results["unclaimed"] = [
            {
                "isrc": r[0],
                "title": r[1],
                "artist": r[2],
                "unclaimedPct": r[3],
                "workRecordId": r[4],
            }
            for r in rows
        ]

    return results


def table_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    row = con.execute(
        """
        SELECT count(*) FROM information_schema.tables
        WHERE table_name = ?
        """,
        [name],
    ).fetchone()
    return bool(row and row[0] > 0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Query MLC DuckDB catalog")
    parser.add_argument("--artist", help="Artist name (ILIKE contains)")
    parser.add_argument("--isrc", help="Exact ISRC lookup")
    parser.add_argument("--limit", type=int, default=50, help="Max rows per table")
    parser.add_argument("--db", help="Override catalog.duckdb path")
    args = parser.parse_args()

    if not args.artist and not args.isrc:
        parser.error("Provide --artist or --isrc")

    db = Path(args.db) if args.db else catalog_db_path()
    if not db.is_file():
        raise SystemExit(
            f"Catalog not found: {db}\n"
            "Run: npm run etl:parquet && npm run etl:catalog"
        )

    con = duckdb.connect(str(db), read_only=True)
    try:
        if args.artist:
            payload = search_artist(con, args.artist, limit=args.limit)
        else:
            payload = search_isrc(con, args.isrc or "", limit=args.limit)
    finally:
        con.close()

    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
