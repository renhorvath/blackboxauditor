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


def list_token_partition_tables(
    con: duckdb.DuckDBPyConnection, token_table: str
) -> list[str]:
    """Indexed shard tables: mlc_unmatched_artist_tokens_p0 … pN."""
    prefix = f"{token_table}_p"
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


def resolve_token_tables(con: duckdb.DuckDBPyConnection, token_table: str) -> list[str]:
    if table_exists(con, token_table):
        return [token_table]
    return list_token_partition_tables(con, token_table)


ISRC_SHARD_PREFIX: dict[str, str] = {
    "mlc_unmatched": "mlc_unmatched_isrc",
    "mlc_unclaimed": "mlc_unclaimed_isrc",
}

ISRC_SHARD_BUCKETS: dict[str, int] = {
    "mlc_unmatched": 85,
    "mlc_unclaimed": 7,
}


def list_isrc_shard_tables(con: duckdb.DuckDBPyConnection, dest_prefix: str) -> list[str]:
    """Indexed ISRC lookup shards: mlc_unmatched_isrc_p0 … pN."""
    prefix = f"{dest_prefix}_p"
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


def resolve_source_tables(con: duckdb.DuckDBPyConnection, source_table: str) -> list[str]:
    shard_prefix = ISRC_SHARD_PREFIX.get(source_table)
    if shard_prefix:
        shards = list_isrc_shard_tables(con, shard_prefix)
        if shards:
            return shards
    if table_exists(con, source_table):
        return [source_table]
    return []


def isrc_shards_ready(con: duckdb.DuckDBPyConnection, source_table: str) -> bool:
    prog_prefix = ISRC_SHARD_PREFIX.get(source_table)
    if not prog_prefix:
        return False
    prog_path = PROGRESS_DIR / f"etl_{prog_prefix}_progress.json"
    if prog_path.is_file():
        try:
            data = json.loads(prog_path.read_text(encoding="utf-8"))
            if data.get("indexed") is True:
                return True
        except json.JSONDecodeError:
            pass
    return len(list_isrc_shard_tables(con, prog_prefix)) > 0


def token_index_ready(con: duckdb.DuckDBPyConnection, token_table: str) -> bool:
    """True only when build finished and indexed — ignore partial tables."""
    prog_path = PROGRESS_DIR / f"etl_{token_table}_progress.json"
    if prog_path.is_file():
        try:
            data = json.loads(prog_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return False
        if data.get("indexed") is True:
            return True

    if table_exists(con, token_table):
        row = con.execute(
            """
            SELECT count(*) FROM duckdb_indexes()
            WHERE lower(table_name) = lower(?)
            """,
            [token_table],
        ).fetchone()
        return bool(row and row[0] > 0)

    partitions = list_token_partition_tables(con, token_table)
    if not partitions:
        return False
    row = con.execute(
        """
        SELECT count(*) FROM duckdb_indexes()
        WHERE lower(table_name) = lower(?)
        """,
        [partitions[0]],
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


def collect_token_isrcs(
    con: duckdb.DuckDBPyConnection,
    token_tables: list[str],
    tokens: list[str],
) -> set[str]:
    """Distinct ISRCs from indexed token shard(s) for an artist query."""
    if not token_tables or not tokens:
        return set()
    placeholders = ", ".join("?" for _ in tokens)
    parts = [
        f"""
        SELECT DISTINCT upper(trim(isrc)) AS isrc
        FROM {tbl}
        WHERE token IN ({placeholders}) AND isrc IS NOT NULL AND trim(isrc) != ''
        """
        for tbl in token_tables
    ]
    sql = " UNION ALL ".join(parts)
    rows = con.execute(
        f"SELECT DISTINCT isrc FROM ({sql}) WHERE isrc IS NOT NULL AND isrc != ''",
        tokens * len(token_tables),
    ).fetchall()
    return {r[0] for r in rows if r[0]}


def group_isrcs_by_shard_bucket(
    con: duckdb.DuckDBPyConnection,
    isrcs: set[str],
    *,
    buckets: int,
) -> dict[int, list[str]]:
    if not isrcs:
        return {}
    isrc_list = sorted(isrcs)
    rows = con.execute(
        f"""
        SELECT isrc, (hash(isrc) % {buckets}) AS bucket
        FROM (SELECT unnest(?) AS isrc)
        """,
        [isrc_list],
    ).fetchall()
    grouped: dict[int, list[str]] = {}
    for isrc, bucket in rows:
        grouped.setdefault(int(bucket), []).append(isrc)
    return grouped


def fetch_rows_from_isrc_shards(
    con: duckdb.DuckDBPyConnection,
    *,
    isrcs: set[str],
    source_table: str,
    columns: tuple[str, ...],
) -> list[tuple]:
    """Lookup display rows via hash-bucketed ISRC shards (fast) or base table."""
    if not isrcs:
        return []

    shard_prefix = ISRC_SHARD_PREFIX.get(source_table)
    buckets = ISRC_SHARD_BUCKETS.get(source_table, 1)
    shard_tables = list_isrc_shard_tables(con, shard_prefix) if shard_prefix else []

    if shard_prefix and len(shard_tables) >= buckets and isrc_shards_ready(con, source_table):
        grouped = group_isrcs_by_shard_bucket(con, isrcs, buckets=buckets)
        cols = ", ".join(columns)
        out: list[tuple] = []
        for bucket, group in grouped.items():
            shard = f"{shard_prefix}_p{bucket}"
            if not table_exists(con, shard):
                continue
            placeholders = ", ".join("?" for _ in group)
            out.extend(
                con.execute(
                    f"SELECT {cols} FROM {shard} WHERE ISRC IN ({placeholders})",
                    group,
                ).fetchall()
            )
        return out

    if table_exists(con, source_table):
        cols = ", ".join(columns)
        isrc_list = sorted(isrcs)
        placeholders = ", ".join("?" for _ in isrc_list)
        return con.execute(
            f"SELECT {cols} FROM {source_table} WHERE ISRC IN ({placeholders})",
            isrc_list,
        ).fetchall()

    return []


def iter_rows_via_token_join(
    con: duckdb.DuckDBPyConnection,
    *,
    token_tables: list[str],
    source_table: str,
    tokens: list[str],
    select_cols: str,
):
    """Token index → ISRC set → bucket-routed shard lookup (avoids 32×85 cross join)."""
    if not token_tables or not tokens:
        return

    isrcs = collect_token_isrcs(con, token_tables, tokens)
    if not isrcs:
        return

    # select_cols like "u.ISRC, u.ResourceTitle, ..." → plain column list
    columns = tuple(c.strip().removeprefix("u.") for c in select_cols.split(","))
    for row in fetch_rows_from_isrc_shards(
        con, isrcs=isrcs, source_table=source_table, columns=columns
    ):
        yield row


def fetch_rows_via_token_isrcs(
    con: duckdb.DuckDBPyConnection,
    *,
    token_tables: list[str],
    source_table: str,
    tokens: list[str],
    select_cols: str,
) -> list[tuple]:
    return list(
        iter_rows_via_token_join(
            con,
            token_tables=token_tables,
            source_table=source_table,
            tokens=tokens,
            select_cols=select_cols,
        )
    )


def fetch_unmatched_via_tokens(
    con: duckdb.DuckDBPyConnection,
    artist_name: str,
    *,
    limit: int,
    match_mode: str = "collab",
) -> list[dict]:
    token_tables = resolve_token_tables(con, "mlc_unmatched_artist_tokens")
    if not token_tables:
        return []

    terms = build_terms(artist_name, artist_name)
    tokens = search_tokens(artist_name)
    if not tokens:
        return []

    placeholders = ", ".join("?" for _ in tokens)
    seen: set[str] = set()
    hits: list[dict] = []

    if token_table_is_minimal(con, token_tables[0]):
        row_iter = iter_rows_via_token_join(
            con,
            token_tables=token_tables,
            source_table="mlc_unmatched",
            tokens=tokens,
            select_cols="u.ISRC, u.ResourceTitle, u.DisplayArtistName, u.OriginalDataProviderName, u.ResourceType",
        )
    else:
        wide_table = token_tables[0]
        row_iter = con.execute(
            f"""
            SELECT ISRC, ResourceTitle, DisplayArtistName, OriginalDataProviderName, ResourceType
            FROM {wide_table}
            WHERE token IN ({placeholders})
            """,
            tokens,
        ).fetchall()

    for isrc, title, artist, provider, resource_type in row_iter:
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
    token_tables = resolve_token_tables(con, "mlc_unclaimed_artist_tokens")
    if not token_tables:
        return []

    terms = build_terms(artist_name, artist_name)
    tokens = search_tokens(artist_name)
    if not tokens:
        return []

    placeholders = ", ".join("?" for _ in tokens)
    if token_table_is_minimal(con, token_tables[0]):
        rows = fetch_rows_via_token_isrcs(
            con,
            token_tables=token_tables,
            source_table="mlc_unclaimed",
            tokens=tokens,
            select_cols="u.ISRC, u.ResourceTitle, u.DisplayArtistName, u.UnclaimedRightSharePercentage, u.MusicalWorkRecordId, u.DspResourceId",
        )
    else:
        wide_table = token_tables[0]
        rows = con.execute(
            f"""
            SELECT ISRC, ResourceTitle, DisplayArtistName,
                   UnclaimedRightSharePercentage, MusicalWorkRecordId, DspResourceId
            FROM {wide_table}
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
    if not table_exists(con, "mlc_unmatched") and not isrc_shards_ready(con, "mlc_unmatched"):
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

    if token_index_ready(con, "mlc_unclaimed_artist_tokens") or resolve_token_tables(
        con, "mlc_unclaimed_artist_tokens"
    ):
        return fetch_unclaimed_via_tokens(
            con, artist_name, limit=limit, match_mode=match_mode
        )

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
