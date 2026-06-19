#!/usr/bin/env python3
"""Fetch all Ferenc Topa MLC works by song code via public-api.themlc.com."""

from __future__ import annotations

import csv
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
BASE = "https://public-api.themlc.com"

# Portal export 2026-06 — FERENC TOPA (44 + 45 works)
PORTAL_SONG_CODES = [
    "CC3BO6", "SC4ISA", "SC331F", "FI6V2X", "SC2S46", "CB1ZWC", "CB1R1Y", "ID1ZR3",
    "DA49I3", "CA6JYQ", "FD9QVB", "SA0MTJ", "FD9JG7", "ID1QHK", "HB6FSI", "CA9GTJ",
    "AB6U7D", "TE2SBZ", "BC01CQ", "SA0LO9", "OC7AK1", "IC41LJ", "NC5HRC", "DA3KBQ",
    "CA6PU7", "FE6VAY", "IC4MUE", "DA3J27", "OC6VV1", "TE2ZLO", "AB5U4E", "NC4VAR",
    "HB8JIG", "ZB0X78", "RA5NB6", "LB2WUC", "MB33JJ", "FE5NPA", "RA48A5", "CA8LHY",
    "BC175Z", "BP6IGT", "C57LK2", "S660EU",
    "EQ438B", "N69NL9", "N80695", "BC7UBK", "RC2T5O", "DD6W2O", "WD1GSL", "CC5EQE",
    "UA8ZDH", "EC6G86", "GE819E", "LF3TYB", "SI7W9R", "SI7W3X", "BD2FJ9", "IG5ULX",
    "GD92OG", "DC0LWC", "BD5JLT", "RB7EIW", "IG36GH", "WD1CNS", "FI624J", "WD04CP",
    "AD83YZ", "IG24QP", "IF9DVT", "CC74TF", "NH337P", "EA59E2", "EA59BY", "BC18RR",
    "MB1R4X", "AX9CA3", "IZ0W57", "IY92KD", "FB3XMO", "IY92JP", "GB1WG6", "RO3DSB",
    "S63BQ9", "OM688A", "W60P15", "BE8D2F", "N74P6Z",
]


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    for path in (ROOT / ".env.local", ROOT / ".env"):
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    return env


def get_id_token(env: dict[str, str]) -> str:
    body = json.dumps({"username": env["MLC_API_KEY"], "password": env["MLC_PASSWORD"]}).encode()
    req = urllib.request.Request(
        f"{BASE}/oauth/token",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        auth = json.loads(resp.read())
    token = auth.get("idToken")
    if not token:
        raise RuntimeError("MLC auth: no idToken in response")
    return token


def fetch_works(codes: list[str], token: str) -> list[dict]:
    body = [{"mlcsongCode": c} for c in codes]
    req = urllib.request.Request(
        f"{BASE}/works",
        data=json.dumps(body).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read())


def known_shares(work: dict) -> float:
    return round(sum(float(p.get("collectionShare") or 0) for p in work.get("publishers") or []), 2)


def flatten_publishers(work: dict) -> str:
    parts: list[str] = []
    for p in work.get("publishers") or []:
        name = p.get("publisherName") or ""
        share = p.get("collectionShare")
        role = p.get("publisherRoleCode") or ""
        if name:
            parts.append(f"{name} ({share}% {role})".strip())
    return "; ".join(parts)


def flatten_writers(work: dict) -> str:
    parts: list[str] = []
    for w in work.get("writers") or []:
        fn = (w.get("writerFirstName") or "").strip()
        ln = (w.get("writerLastName") or "").strip()
        ipi = (w.get("writerIPI") or "").strip()
        label = f"{fn} {ln}".strip()
        if ipi:
            label += f" [{ipi}]"
        if label:
            parts.append(label)
    return "; ".join(parts)


def main() -> None:
    env = load_env()
    if not env.get("MLC_API_KEY") or not env.get("MLC_PASSWORD"):
        raise SystemExit("MLC_API_KEY and MLC_PASSWORD required in .env.local")

    codes = list(dict.fromkeys(PORTAL_SONG_CODES))
    token = get_id_token(env)

    all_works: list[dict] = []
    missing: list[str] = []
    batch_size = 10

    for i in range(0, len(codes), batch_size):
        chunk = codes[i : i + batch_size]
        try:
            works = fetch_works(chunk, token)
        except urllib.error.HTTPError as e:
            print(f"batch failed {chunk[0]}..{chunk[-1]}: {e.code} {e.read().decode()[:200]}")
            for code in chunk:
                try:
                    works = fetch_works([code], token)
                    all_works.extend(works)
                except urllib.error.HTTPError as e2:
                    missing.append(code)
                    print(f"  missing {code}: {e2.code}")
                time.sleep(0.2)
            time.sleep(0.3)
            continue

        returned = {w.get("mlcSongCode") for w in works}
        for code in chunk:
            if code not in returned:
                missing.append(code)
        all_works.extend(works)
        print(f"fetched {len(works)}/{len(chunk)} (total {len(all_works)})")
        time.sleep(0.25)

    # dedupe by song code
    by_code: dict[str, dict] = {}
    for w in all_works:
        code = w.get("mlcSongCode")
        if code:
            by_code[code] = w

    rows: list[dict] = []
    for code in codes:
        w = by_code.get(code)
        if not w:
            continue
        share = known_shares(w)
        rows.append(
            {
                "mlc_song_code": code,
                "title": w.get("primaryTitle") or "",
                "iswc": w.get("iswc") or "",
                "known_shares_pct": share,
                "partial_share": "Y" if share < 99.9 else "",
                "writers": flatten_writers(w),
                "publishers": flatten_publishers(w),
                "recording_artists": w.get("artists") or "",
            }
        )

    out_csv = DATA / "mlc_api_topa_works.csv"
    out_json = DATA / "mlc_api_topa_works_detail.json"
    fields = list(rows[0].keys()) if rows else []
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    out_json.write_text(json.dumps(list(by_code.values()), indent=2, ensure_ascii=False))

    summary = {
        "requested_codes": len(codes),
        "fetched_works": len(rows),
        "missing_codes": missing,
        "partial_share_count": sum(1 for r in rows if r["partial_share"] == "Y"),
        "no_iswc_count": sum(1 for r in rows if not r["iswc"]),
    }
    (DATA / "mlc_api_topa_works_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    print(f"Wrote {out_csv} ({len(rows)} rows)")

    # Work-level registry with Spotify impact proxy (max popularity per title match)
    try:
        import re as _re
        from snyl_consolidate import norm_title  # type: ignore
    except ImportError:
        norm_title = lambda s: _re.sub(r"\s+", " ", (s or "").upper()).strip()  # noqa: E731

    pop_by_title: dict[str, int] = {}
    pop_path = DATA / "snyl_spotify_popularity.csv"
    cat_path = DATA / "snyl_catalog_snyl_only.csv"
    if pop_path.exists() and cat_path.exists():
        pop_map = {
            (r.get("isrc") or "").upper(): int(r.get("popularity") or 0)
            for r in csv.DictReader(pop_path.open())
            if r.get("isrc")
        }
        for r in csv.DictReader(cat_path.open()):
            isrc = (r.get("isrc") or "").upper()
            if not isrc or isrc not in pop_map:
                continue
            key = norm_title(r.get("title", ""))
            pop_by_title[key] = max(pop_by_title.get(key, 0), pop_map[isrc])

    reg_rows: list[dict] = []
    for r in rows:
        key = norm_title(r["title"])
        max_pop = pop_by_title.get(key, 0)
        for k, v in pop_by_title.items():
            if key and (key in k or k in key) and len(key) >= 6:
                max_pop = max(max_pop, v)
        reg_rows.append(
            {
                **r,
                "spotify_popularity_max": max_pop,
                "impact_tier": (
                    "high" if max_pop >= 50 else "medium" if max_pop >= 20 else "low" if max_pop >= 1 else "none"
                ),
            }
        )
    reg_path = DATA / "snyl_mlc_work_registry.csv"
    reg_fields = list(reg_rows[0].keys()) if reg_rows else []
    with reg_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=reg_fields)
        w.writeheader()
        w.writerows(reg_rows)
    print(f"Wrote {reg_path} ({len(reg_rows)} MLC works)")


if __name__ == "__main__":
    main()
