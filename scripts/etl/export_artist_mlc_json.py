#!/usr/bin/env python3
"""
Export MLC artist hits from DuckDB catalog (same JSON shape as scripts/mlc/export_artist_*_json.py).
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import duckdb

ETL_DIR = Path(__file__).resolve().parent
MLC_DIR = ETL_DIR.parent / "mlc"
sys.path.insert(0, str(MLC_DIR))

from catalog_paths import catalog_db_path, load_dotenv_local  # noqa: E402
from scan_tsv_by_artist import artist_matches, build_terms, normalize, slugify  # noqa: E402

load_dotenv_local()

PROGRESS_DIR = ETL_DIR.parent.parent / "derived" / "mlc-hu"


def token_index_ready(con: duckdb.DuckDBPyConnection, token_table: str) -> bool:
    """True only when build finished and indexed — ignore partial tables."""
    if not table_exists(con, token_table):
        return False
    prog_path = PROGRESS_DIR / f"etl_{token_table}_progress.json"
    if prog_path.is_file():
        try:
            data = json.loads(prog_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return False
        return data.get("indexed") is True
    # Legacy: built before progress files (e.g. unclaimed index)
    row = con.execute(
        """
        SELECT count(*) FROM duckdb_indexes()
        WHERE lower(table_name) = lower(?)
        """,
        [token_table],
    ).fetchone()
    return bool(row and row[0] > 0)


def table_exists(con: duckdb.DuckDBPyConnection, name: str) -> bool:
    row = con.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name = ?",
        [name],
    ).fetchone()
    return bool(row and row[0] > 0)


def sql_like_pattern(term: str) -> str:
    return f"%{term.strip()}%"


def search_tokens(artist_name: str) -> list[str]:
    tokens: list[str] = []
    for term in build_terms(artist_name, artist_name):
        norm = normalize(term)
        if not norm:
            continue
        for word in norm.split():
            if len(word) >= 2 and word not in tokens:
                tokens.append(word)
    return tokens


def token_table_is_minimal(con: duckdb.DuckDBPyConnection, token_table: str) -> bool:
    rows = con.execute(
        """
        SELECT lower(column_name)
        FROM information_schema.columns
        WHERE table_name = ?
        """,
        [token_table],
    ).fetchall()
    cols = {r[0] for r in rows}
    return cols <= {"token", "isrc"}


def fetch_rows_via_token_isrcs(
    con: duckdb.DuckDBPyConnection,
    *,
    token_table: str,
    source_table: str,
    tokens: list[str],
    select_cols: str,
) -> list[tuple]:
    """Token lookup → distinct ISRCs → source row fetch (avoids full-table join)."""
    placeholders = ", ".join("?" for _ in tokens)
    isrc_rows = con.execute(
        f"SELECT DISTINCT isrc FROM {token_table} WHERE token IN ({placeholders})",
        tokens,
    ).fetchall()
    isrcs = [r[0] for r in isrc_rows if r[0]]
    if not isrcs:
        return []

    isrc_ph = ", ".join("?" for _ in isrcs)
    # catalog ISRC values are already upper(trim) — avoid upper(trim) here (68M-row scan).
    return con.execute(
        f"SELECT {select_cols} FROM {source_table} WHERE ISRC IN ({isrc_ph})",
        isrcs,
    ).fetchall()


def fetch_unmatched_via_tokens(
    con: duckdb.DuckDBPyConnection,
    artist_name: str,
    *,
    limit: int,
    match_mode: str = "collab",
) -> list[dict]:
    if not table_exists(con, "mlc_unmatched_artist_tokens"):
        return []

    terms = build_terms(artist_name, artist_name)
    tokens = search_tokens(artist_name)
    if not tokens:
        return []

    placeholders = ", ".join("?" for _ in tokens)
    if token_table_is_minimal(con, "mlc_unmatched_artist_tokens"):
        rows = fetch_rows_via_token_isrcs(
            con,
            token_table="mlc_unmatched_artist_tokens",
            source_table="mlc_unmatched",
            tokens=tokens,
            select_cols="ISRC, ResourceTitle, DisplayArtistName, OriginalDataProviderName, ResourceType",
        )
    else:
        rows = con.execute(
            f"""
            SELECT ISRC, ResourceTitle, DisplayArtistName, OriginalDataProviderName, ResourceType
            FROM mlc_unmatched_artist_tokens
            WHERE token IN ({placeholders})
            """,
            tokens,
        ).fetchall()

    seen: set[str] = set()
    hits: list[dict] = []
    for isrc, title, artist, provider, resource_type in rows:
        if not artist_matches(str(artist or ""), terms, match_mode):
            continue
        key = (isrc or "").strip().upper()
        if not key or key in seen:
            continue
        seen.add(key)
        hits.append(
            {
                "isrc": key,
                "title": (title or "").strip(),
                "artist": (artist or "").strip(),
                "provider": (provider or "").strip(),
                "resourceType": (resource_type or "").strip() or None,
            }
        )
        if len(hits) >= limit:
            break
    return hits


def fetch_unclaimed_via_tokens(
    con: duckdb.DuckDBPyConnection,
    artist_name: str,
    *,
    limit: int,
    match_mode: str = "collab",
) -> list[dict]:
    if not table_exists(con, "mlc_unclaimed_artist_tokens"):
        return []

    terms = build_terms(artist_name, artist_name)
    tokens = search_tokens(artist_name)
    if not tokens:
        return []

    placeholders = ", ".join("?" for _ in tokens)
    if token_table_is_minimal(con, "mlc_unclaimed_artist_tokens"):
        rows = fetch_rows_via_token_isrcs(
            con,
            token_table="mlc_unclaimed_artist_tokens",
            source_table="mlc_unclaimed",
            tokens=tokens,
            select_cols="ISRC, ResourceTitle, DisplayArtistName, UnclaimedRightSharePercentage, MusicalWorkRecordId, DspResourceId",
        )
    else:
        rows = con.execute(
            f"""
            SELECT ISRC, ResourceTitle, DisplayArtistName,
                   UnclaimedRightSharePercentage, MusicalWorkRecordId, DspResourceId
            FROM mlc_unclaimed_artist_tokens
            WHERE token IN ({placeholders})
            """,
            tokens,
        ).fetchall()

    by_isrc: dict[str, dict] = {}
    for isrc, title, artist, pct, work_id, dsp_id in rows:
        if not artist_matches(str(artist or ""), terms, match_mode):
            continue
        key = (isrc or "").strip().upper()
        if not key:
            continue

        pct_val = float(pct) if pct is not None and str(pct).strip() != "" else None
        hit = {
            "isrc": key,
            "title": (title or "").strip(),
            "artist": (artist or "").strip(),
            "workRecordId": (work_id or "").strip(),
            "unclaimedPct": pct_val,
            "dspResourceId": (dsp_id or "").strip(),
        }

        existing = by_isrc.get(key)
        if existing is None:
            by_isrc[key] = hit
            continue
        if pct_val is not None:
            prev = existing.get("unclaimedPct")
            if prev is None or pct_val > prev:
                existing["unclaimedPct"] = pct_val

        if len(by_isrc) >= limit:
            break

    return list(by_isrc.values())[:limit]


def fetch_unmatched(
    con: duckdb.DuckDBPyConnection,
    artist_name: str,
    *,
    limit: int,
    match_mode: str = "collab",
) -> list[dict]:
    if not table_exists(con, "mlc_unmatched"):
        return []

    via_tokens = fetch_unmatched_via_tokens(
        con, artist_name, limit=limit, match_mode=match_mode
    )
    if via_tokens:
        return via_tokens
    if token_index_ready(con, "mlc_unmatched_artist_tokens"):
        return []

    terms = build_terms(artist_name, artist_name)
    if not terms:
        return []

    patterns = [sql_like_pattern(t) for t in terms]
    clause = " OR ".join("DisplayArtistName ILIKE ?" for _ in patterns)
    sql = f"""
        SELECT ISRC, ResourceTitle, DisplayArtistName, OriginalDataProviderName, ResourceType
        FROM mlc_unmatched
        WHERE {clause}
        LIMIT ?
    """
    # Fetch extra rows for post-filtering with collab logic.
    fetch_limit = min(max(limit * 20, 500), 50_000)
    rows = con.execute(sql, [*patterns, fetch_limit]).fetchall()

    seen: set[str] = set()
    hits: list[dict] = []
    for isrc, title, artist, provider, resource_type in rows:
        if not artist_matches(str(artist or ""), terms, match_mode):
            continue
        key = (isrc or "").strip().upper()
        if not key or key in seen:
            continue
        seen.add(key)
        hits.append(
            {
                "isrc": key,
                "title": (title or "").strip(),
                "artist": (artist or "").strip(),
                "provider": (provider or "").strip(),
                "resourceType": (resource_type or "").strip() or None,
            }
        )
        if len(hits) >= limit:
            break
    return hits


def fetch_unclaimed(
    con: duckdb.DuckDBPyConnection,
    artist_name: str,
    *,
    limit: int,
    match_mode: str = "collab",
) -> list[dict]:
    if not table_exists(con, "mlc_unclaimed"):
        return []

    via_tokens = fetch_unclaimed_via_tokens(
        con, artist_name, limit=limit, match_mode=match_mode
    )
    if via_tokens:
        return via_tokens
    if token_index_ready(con, "mlc_unclaimed_artist_tokens"):
        return []

    terms = build_terms(artist_name, artist_name)
    if not terms:
        return []

    patterns = [sql_like_pattern(t) for t in terms]
    clause = " OR ".join("DisplayArtistName ILIKE ?" for _ in patterns)
    sql = f"""
        SELECT ISRC, ResourceTitle, DisplayArtistName,
               UnclaimedRightSharePercentage, MusicalWorkRecordId, DspResourceId
        FROM mlc_unclaimed
        WHERE {clause}
        LIMIT ?
    """
    fetch_limit = min(max(limit * 20, 500), 50_000)
    rows = con.execute(sql, [*patterns, fetch_limit]).fetchall()

    by_isrc: dict[str, dict] = {}
    for isrc, title, artist, pct, work_id, dsp_id in rows:
        if not artist_matches(str(artist or ""), terms, match_mode):
            continue
        key = (isrc or "").strip().upper()
        if not key:
            continue

        pct_val = float(pct) if pct is not None and str(pct).strip() != "" else None
        hit = {
            "isrc": key,
            "title": (title or "").strip(),
            "artist": (artist or "").strip(),
            "workRecordId": (work_id or "").strip(),
            "unclaimedPct": pct_val,
            "dspResourceId": (dsp_id or "").strip(),
        }

        existing = by_isrc.get(key)
        if existing is None:
            by_isrc[key] = hit
            continue
        if pct_val is not None:
            prev = existing.get("unclaimedPct")
            if prev is None or pct_val > prev:
                existing["unclaimedPct"] = pct_val

        if len(by_isrc) >= limit:
            break

    return list(by_isrc.values())[:limit]


def main() -> None:
    parser = argparse.ArgumentParser(description="MLC artist export via DuckDB")
    parser.add_argument("--name", required=True, help="Artist name")
    parser.add_argument(
        "--kind",
        choices=("unmatched", "unclaimed"),
        required=True,
        help="Which MLC table to query",
    )
    parser.add_argument("--db", help="Override catalog.duckdb path")
    parser.add_argument("--limit", type=int, default=5000, help="Max unique ISRCs")
    parser.add_argument(
        "--out-dir",
        help="Unused; kept for CLI compatibility with mlc export scripts",
    )
    args = parser.parse_args()

    artist_name = args.name.strip()
    slug = slugify(artist_name)
    db = Path(args.db) if args.db else catalog_db_path()

    if not db.is_file():
        print(json.dumps({"error": "catalog_missing", "catalogPath": str(db)}), file=sys.stderr)
        raise SystemExit(2)

    con = duckdb.connect(str(db), read_only=True)
    try:
        if args.kind == "unmatched":
            hits = fetch_unmatched(con, artist_name, limit=args.limit)
            export_path = f"{slug}_mlc_export.csv"
        else:
            hits = fetch_unclaimed(con, artist_name, limit=args.limit)
            export_path = f"{slug}_mlc_unclaimed_export.csv"
    finally:
        con.close()

    payload = {
        "artistName": artist_name,
        "slug": slug,
        "exportPath": export_path,
        "uniqueIsrcCount": len(hits),
        "hits": hits,
        "scanSource": "duckdb",
        "catalogPath": str(db),
    }
    print(json.dumps(payload, ensure_ascii=False))


if __name__ == "__main__":
    main()
