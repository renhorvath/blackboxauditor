#!/usr/bin/env python3
"""Query neighbouring-all.duckdb for an artist name. Prints JSON to stdout."""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "data" / "demo" / "neighbouring-all.duckdb"
PER_SOURCE_CAP = 40

SOURCE_LABEL = {
    "nl-sena": "SENA",
    "ro-credidam": "CREDIDAM",
    "ee-eel": "EEL",
    "fi-gramex": "Gramex",
    "cz-intergram": "INTERGRAM",
    "de-gvl": "GVL",
}


def fold(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFD", str(value))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.lower().replace("&", " ").replace("+", " ")
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip()


def main() -> None:
    query = " ".join(sys.argv[1:]).strip()
    if len(query) < 2:
        print(json.dumps({"error": "query too short", "hits": []}))
        sys.exit(1)
    if not DB.is_file():
        print(
            json.dumps(
                {
                    "error": f"missing {DB.name} — run scripts/cmo/build_neighbouring_demo_db.py",
                    "hits": [],
                }
            )
        )
        sys.exit(2)

    q = fold(query)
    tokens = [t for t in q.split() if len(t) >= 2]
    con = duckdb.connect(str(DB), read_only=True)

    # Exact fold / contains / all-tokens-in-performer
    rows = con.execute(
        """
        SELECT source, performer, title, isrc, file, performer_fold
        FROM hits
        WHERE performer_fold = ?
           OR performer_fold LIKE ?
           OR (
             length(?) >= 4 AND list_has_all(
               string_split(performer_fold, ' '),
               ?
             )
           )
        """,
        [q, f"%{q}%", q, tokens if tokens else [q]],
    ).fetchall()

    # Prefer stronger matches first; cap per source
    scored: list[tuple[int, dict]] = []
    for source, performer, title, isrc, file, pf in rows:
        if pf == q:
            score = 0
        elif q in pf.split():
            score = 1
        elif pf.startswith(q) or pf.endswith(q):
            score = 2
        else:
            score = 3
        scored.append(
            (
                score,
                {
                    "source": source,
                    "label": SOURCE_LABEL.get(source, source),
                    "performer": performer or "",
                    "title": title or "",
                    "isrc": (isrc or "") or None,
                    "file": file or "",
                },
            )
        )
    scored.sort(key=lambda x: (x[0], x[1]["source"], x[1]["title"]))

    per_source: dict[str, int] = {}
    hits: list[dict] = []
    seen: set[tuple[str, str, str]] = set()
    for _score, hit in scored:
        key = (hit["source"], fold(hit["title"]), hit["isrc"] or "")
        if key in seen:
            continue
        n = per_source.get(hit["source"], 0)
        if n >= PER_SOURCE_CAP:
            continue
        per_source[hit["source"]] = n + 1
        seen.add(key)
        hits.append(hit)

    counts = {
        row[0]: int(row[1])
        for row in con.execute(
            "SELECT source, count(*) FROM hits GROUP BY source"
        ).fetchall()
    }
    con.close()
    print(
        json.dumps(
            {
                "query": query,
                "queryFold": q,
                "hits": hits,
                "hitCount": len(hits),
                "bySourceReturned": per_source,
                "indexCounts": counts,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
