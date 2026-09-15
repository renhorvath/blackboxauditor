#!/usr/bin/env python3
"""Build local DuckDB index of all neighbouring UP lists for the radar demo.

Sources: SENA, CREDIDAM, EEL, Gramex, INTERGRAM, GVL (same paths as
match_hu_acts_neighbouring.py). Output: data/demo/neighbouring-all.duckdb
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from match_hu_acts_neighbouring import (  # noqa: E402
    fold,
    load_sources,
)

OUT_DB = ROOT / "data" / "demo" / "neighbouring-all.duckdb"
OUT_META = ROOT / "data" / "demo" / "neighbouring-all-meta.json"
BATCH = 20_000


def main() -> None:
    OUT_DB.parent.mkdir(parents=True, exist_ok=True)
    if OUT_DB.exists():
        OUT_DB.unlink()

    t0 = time.time()
    src_con = duckdb.connect()
    src_con.execute("INSTALL excel; LOAD excel;")
    print("Loading neighbouring xlsx…", flush=True)
    sources = load_sources(src_con)
    src_con.close()

    db = duckdb.connect(str(OUT_DB))
    db.execute(
        """
        CREATE TABLE hits (
          source VARCHAR,
          performer VARCHAR,
          title VARCHAR,
          isrc VARCHAR,
          file VARCHAR,
          performer_fold VARCHAR
        )
        """
    )

    meta_counts: dict[str, int] = {}
    total = 0
    for sid, rows in sources.items():
        print(f"  insert {sid}: {len(rows):,}", flush=True)
        meta_counts[sid] = len(rows)
        buf: list[tuple[str, str, str, str, str, str]] = []
        for performer, title, isrc, tag in rows:
            pf = fold(performer)
            if not pf:
                continue
            buf.append(
                (
                    sid,
                    performer or "",
                    title or "",
                    (isrc or "").strip().upper(),
                    tag or "",
                    pf,
                )
            )
            if len(buf) >= BATCH:
                db.executemany(
                    "INSERT INTO hits VALUES (?, ?, ?, ?, ?, ?)",
                    buf,
                )
                total += len(buf)
                buf.clear()
        if buf:
            db.executemany("INSERT INTO hits VALUES (?, ?, ?, ?, ?, ?)", buf)
            total += len(buf)
            buf.clear()

    # SNYL / bbox GVL extras (already partly in KONU; keep as tagged supplement)
    bbox = ROOT / "data" / "snyl_bbox_report_findings.csv"
    if bbox.is_file():
        import csv

        extra = 0
        with bbox.open() as f:
            for row in csv.DictReader(f):
                src = (row.get("sources") or "") + (row.get("playbooks") or "")
                if "gvl" not in src.lower():
                    continue
                performer = row.get("artist") or "SNYL"
                title = (row.get("title") or "").strip().strip('"')
                isrc = row.get("isrc") or ""
                if isrc.startswith("cmo:"):
                    isrc = ""
                pf = fold(performer)
                if not pf:
                    continue
                db.execute(
                    "INSERT INTO hits VALUES (?, ?, ?, ?, ?, ?)",
                    [
                        "de-gvl",
                        performer,
                        title,
                        isrc.upper(),
                        "snyl_bbox_report_findings.csv",
                        pf,
                    ],
                )
                extra += 1
        print(f"  bbox gvl extras: {extra}", flush=True)
        meta_counts["de-gvl"] = meta_counts.get("de-gvl", 0) + extra
        total += extra

    print("Indexing…", flush=True)
    db.execute("CREATE INDEX idx_hits_fold ON hits(performer_fold)")
    db.execute("CREATE INDEX idx_hits_source ON hits(source)")
    db.execute("ANALYZE hits")
    db.close()

    meta = {
        "builtAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalRows": total,
        "bySource": meta_counts,
        "db": str(OUT_DB.relative_to(ROOT)),
    }
    OUT_META.write_text(json.dumps(meta, ensure_ascii=False, indent=2))
    print(f"Done {total:,} rows → {OUT_DB} in {time.time() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
