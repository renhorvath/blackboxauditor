#!/usr/bin/env python3
"""ISRC-level actionable gap table for SNYL / Ferenc Topa audit."""

from __future__ import annotations

import ast
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SYNC = Path("/Users/ren/synchreload")

sys.path.insert(0, str(ROOT / "scripts"))
from snyl_consolidate import ISWC_NET, norm_iswc, norm_title, load_env, credits_batch  # noqa: E402


def base_work(title: str) -> str:
    t = (title or "").upper()
    t = re.sub(r"\s*-\s*SNYL\s+REMIX.*$", "", t, flags=re.I)
    t = re.sub(r"\s*\(SNYL\s+REMIX\).*$", "", t, flags=re.I)
    t = re.sub(r"\s*-\s*[^-]+REMIX.*$", "", t, flags=re.I)
    t = re.sub(r"\s*-\s*[^-]+MIX.*$", "", t, flags=re.I)
    t = re.sub(r"\s*\([^)]*REMIX[^)]*\).*$", "", t, flags=re.I)
    t = re.sub(r"\s*\([^)]*MIX[^)]*\).*$", "", t, flags=re.I)
    return norm_title(t)


def track_type(title: str, roles: str) -> str:
    t = (title or "").lower()
    if re.search(r"\bsnyl\s+remix\b", t) or re.search(r"\(snyl\s+remix\)", t):
        return "snyL_remix"
    if "remix" in t or "edit" in t or "dub mix" in t or "club mix" in t:
        return "remix_of_snyL"
    if "mixed" in t or "streaming cut" in t:
        return "dj_mix"
    return "original"


def yn(flag: bool) -> str:
    return "igen" if flag else "nem"


def load_iswc_by_norm() -> dict[str, str]:
    out: dict[str, str] = {}
    for iswc, title in ISWC_NET:
        out[norm_title(title)] = norm_iswc(iswc)
    return out


def merge_iswcs(*sources: str) -> str:
    seen: list[str] = []
    for src in sources:
        for part in (src or "").split(";"):
            part = norm_iswc(part.strip())
            if part and part not in seen:
                seen.append(part)
    return ";".join(seen)


def mlc_iswc_string(matches: list[dict]) -> str:
    return ";".join(sorted({m["iswc"] for m in matches if m.get("iswc")}))


def resolve_iswc(
    iswc_by: dict[str, str],
    pkey: str,
    bkey: str,
    mlc_matches: list[dict],
    cfm_entry: dict | None = None,
) -> tuple[str, str]:
    net = iswc_by.get(pkey) or iswc_by.get(bkey) or ""
    mlc = mlc_iswc_string(mlc_matches)
    cfm = norm_iswc((cfm_entry or {}).get("iswc") or "")
    merged = merge_iswcs(net, mlc, cfm)
    return merged, yn(bool(merged))


def load_mlc_works() -> tuple[dict[str, list[dict]], dict[str, dict]]:
    """All MLC works indexed by normalized title and by song code."""
    by_norm: dict[str, list[dict]] = {}
    by_code: dict[str, dict] = {}
    path = DATA / "mlc_api_topa_works.csv"
    if not path.exists():
        return by_norm, by_code

    def add(key: str, entry: dict) -> None:
        by_norm.setdefault(key, []).append(entry)

    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            entry = {
                "code": r["mlc_song_code"],
                "title": r["title"],
                "share": r.get("known_shares_pct") or "",
                "iswc": norm_iswc(r.get("iswc") or ""),
                "writers": r.get("writers") or "",
                "publishers": r.get("publishers") or "",
                "recording_artists": r.get("recording_artists") or "",
                "partial": r.get("partial_share") == "Y",
            }
            by_code[entry["code"]] = entry
            add(norm_title(r["title"]), entry)
    return by_norm, by_code


def pick_mlc_matches(title: str, parent: str, by_norm: dict[str, list[dict]]) -> list[dict]:
    keys = [norm_title(title)]
    if parent:
        keys.append(parent)
    seen: set[str] = set()
    matches: list[dict] = []
    for key in keys:
        if not key or key in seen:
            continue
        seen.add(key)
        for m in by_norm.get(key, []):
            if m["code"] not in {x["code"] for x in matches}:
                matches.append(m)
    if matches:
        return matches
    # fuzzy: parent contained in mlc title key
    for key, items in by_norm.items():
        for k in keys:
            if k and (k in key or key in k) and len(k) >= 6:
                for m in items:
                    if m["code"] not in {x["code"] for x in matches}:
                        matches.append(m)
    return matches


def load_spotify_popularity() -> dict[str, dict]:
    path = DATA / "snyl_spotify_popularity.csv"
    if not path.exists():
        return {}
    out: dict[str, dict] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            isrc = (r.get("isrc") or "").strip().upper()
            if isrc:
                out[isrc] = r
    return out


def impact_tier(pop: str) -> str:
    if not pop and pop != 0:
        return "unknown"
    try:
        p = int(pop)
    except ValueError:
        return "unknown"
    if p >= 50:
        return "high"
    if p >= 20:
        return "medium"
    if p >= 1:
        return "low"
    return "none"


def load_artisjus_csv_titles() -> set[str]:
    titles: set[str] = set()
    path = SYNC / "artisjus_azonositatlan_muvek_2025.csv"
    if not path.exists():
        return titles
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            if "TOPA FERENC" not in (r.get("jogosultak") or "").upper():
                continue
            mucim = (r.get("mucim") or "").strip()
            if mucim:
                titles.add(norm_title(mucim))
    return titles


def load_bbox_by_isrc() -> dict[str, dict]:
    out: dict[str, dict] = {}
    path = DATA / "snyl_bbox_report_findings.csv"
    if not path.exists():
        return out
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            isrc = (r.get("isrc") or "").strip().upper()
            if not isrc:
                continue
            pbs = r.get("playbooks", "")
            out[isrc] = {
                "title": re.sub(r'^"+|"+$', "", r.get("title", "")),
                "artisjus": "artisjus" in pbs,
                "eji": "eji" in pbs,
                "gvl": "gvl" in pbs,
                "mlc_unmatched": "unmatched_recording" in pbs,
                "mlc_unclaimed": "unclaimed_share" in pbs,
            }
    return out


def gap_score(row: dict) -> int:
    score = 0
    if row["artisjus_bbox"] == "igen":
        score += 4
    if row["mlc_unmatched"] == "igen":
        score += 3
    if row["mlc_unclaimed"] == "igen":
        score += 2
    if row["iswc_net"] == "nem" and row["track_type"] == "original":
        score += 2
    if row["eji"] == "igen":
        score += 1
    if row["track_type"] in ("snyL_remix", "remix_of_snyL") and row["artisjus_bbox"] == "nem":
        score += 2
    return score


def recommend(row: dict) -> str:
    parts: list[str] = []
    tt = row["track_type"]
    if row["artisjus_bbox"] == "igen":
        parts.append("Artisjus: azonosítás/claim")
    elif tt in ("snyL_remix", "remix_of_snyL") and row["artisjus_parent_csv"] == "nem":
        parts.append("Artisjus: remix mű regisztráció?")
    elif row["artisjus_parent_csv"] == "igen" and row["artisjus_bbox"] == "nem":
        parts.append("Artisjus: szülőmű bent van, remix külön?")

    if row["mlc_unmatched"] == "igen":
        parts.append("MLC: ISRC párosítás")
    if row["mlc_unclaimed"] == "igen":
        parts.append("MLC: share claim")
    if row["mlc_work"] == "nem" and row["iswc_net"] == "igen":
        parts.append("MLC: mű regisztráció (ISWC van)")
    shares_raw = row.get("mlc_share") or ""
    share_vals = []
    for part in str(shares_raw).split(";"):
        part = part.strip()
        if part:
            try:
                share_vals.append(float(part))
            except ValueError:
                pass
    if share_vals and min(share_vals) < 99.9:
        parts.append(f"MLC: share pótlás ({';'.join(str(s) for s in share_vals)}%)")
    if row["eji"] == "igen":
        parts.append("EJI: előadói regisztráció")
    if row["gvl"] == "igen":
        parts.append("GVL: Mitwirkung")
    if not parts:
        return "—"
    return " · ".join(parts)


def priority(row: dict) -> str:
    if row["artisjus_bbox"] == "igen" and row["mlc_unmatched"] == "igen":
        return "P0"
    if row["track_type"] in ("snyL_remix", "remix_of_snyL") and (
        row["mlc_unmatched"] == "igen" or row["artisjus_bbox"] == "igen"
    ):
        return "P0" if row["artisjus_bbox"] == "igen" else "P1"
    if row["mlc_unmatched"] == "igen" or row["artisjus_bbox"] == "igen":
        return "P1"
    if row["gap_score"] > 0:
        return "P2"
    return "OK"


def main() -> None:
    iswc_by = load_iswc_by_norm()
    mlc_by_norm, _mlc_by_code = load_mlc_works()
    pop_by_isrc = load_spotify_popularity()
    artisjus_csv = load_artisjus_csv_titles()
    bbox_by = load_bbox_by_isrc()

    spotify_path = DATA / "snyl_catalog_snyl_only.csv"
    tracks = list(csv.DictReader(spotify_path.open(newline="", encoding="utf-8")))

    env = load_env()
    api_key = env.get("CREDITS_FM_API_KEY", "")
    isrcs = [r["isrc"].strip().upper() for r in tracks if r.get("isrc")]
    cfm: dict[str, dict] = {}
    if api_key and isrcs:
        cfm = credits_batch(list(dict.fromkeys(isrcs)), api_key)

    rows: list[dict] = []
    for tr in tracks:
        title = tr.get("title", "")
        isrc = (tr.get("isrc") or "").strip().upper()
        tt = track_type(title, tr.get("roles", ""))
        parent = base_work(title)
        bkey = norm_title(title)
        pkey = parent or bkey

        mlc_matches = pick_mlc_matches(title, parent or bkey, mlc_by_norm)
        mlc_codes = ";".join(m["code"] for m in mlc_matches)
        mlc_shares = ";".join(str(m["share"]) for m in mlc_matches if m.get("share"))
        mlc_writers = " | ".join(sorted({m["writers"] for m in mlc_matches if m.get("writers")}))
        mlc_publishers = " | ".join(sorted({m["publishers"] for m in mlc_matches if m.get("publishers")}))
        pop = pop_by_isrc.get(isrc, {})
        popularity = pop.get("popularity", "")
        bx = bbox_by.get(isrc, {})

        art_bbox = bx.get("artisjus", False)
        art_parent = pkey in artisjus_csv or bkey in artisjus_csv

        cfm_entry = cfm.get(isrc, {})
        cfm_status = (cfm_entry.get("match_status") or "").lower()

        iswc, iswc_flag = resolve_iswc(iswc_by, pkey, bkey, mlc_matches, cfm_entry)

        row = {
            "priority": "",
            "track_type": tt,
            "parent_work": parent or bkey,
            "title": title,
            "isrc": isrc,
            "release_date": tr.get("release_date", ""),
            "roles": tr.get("roles", ""),
            "iswc_net": iswc_flag,
            "iswc": iswc,
            "mlc_work": yn(bool(mlc_matches)),
            "mlc_song_code": mlc_codes,
            "mlc_share": mlc_shares,
            "mlc_writers": mlc_writers,
            "mlc_publishers": mlc_publishers,
            "spotify_popularity": popularity,
            "impact_tier": impact_tier(str(popularity)),
            "artisjus_bbox": yn(art_bbox),
            "artisjus_parent_csv": yn(art_parent),
            "eji": yn(bx.get("eji", False)),
            "gvl": yn(bx.get("gvl", False)),
            "mlc_unmatched": yn(bx.get("mlc_unmatched", False) if isrc else False),
            "mlc_unclaimed": yn(bx.get("mlc_unclaimed", False) if isrc else False),
            "credits_fm": cfm_status or "nincs_adat",
            "gap_score": 0,
            "teendo": "",
        }
        row["gap_score"] = gap_score(row)
        row["priority"] = priority(row)
        row["teendo"] = recommend(row)
        rows.append(row)

    # bbox findings without spotify row
    spotify_isrcs = {r["isrc"] for r in rows if r["isrc"]}
    for isrc, bx in bbox_by.items():
        if isrc in spotify_isrcs:
            continue
        title = bx["title"]
        parent = base_work(title)
        bkey = norm_title(title)
        pkey = parent or bkey
        mlc_matches = pick_mlc_matches(title, pkey, mlc_by_norm)
        mlc_codes = ";".join(m["code"] for m in mlc_matches)
        mlc_shares = ";".join(str(m["share"]) for m in mlc_matches if m.get("share"))
        mlc_writers = " | ".join(sorted({m["writers"] for m in mlc_matches if m.get("writers")}))
        mlc_publishers = " | ".join(sorted({m["publishers"] for m in mlc_matches if m.get("publishers")}))
        iswc, iswc_flag = resolve_iswc(iswc_by, pkey, bkey, mlc_matches)
        row = {
            "priority": "",
            "track_type": track_type(title, ""),
            "parent_work": pkey,
            "title": title,
            "isrc": isrc,
            "release_date": "",
            "roles": "bbox_only",
            "iswc_net": iswc_flag,
            "iswc": iswc,
            "mlc_work": yn(bool(mlc_matches)),
            "mlc_song_code": mlc_codes,
            "mlc_share": mlc_shares,
            "mlc_writers": mlc_writers,
            "mlc_publishers": mlc_publishers,
            "spotify_popularity": "",
            "impact_tier": "unknown",
            "artisjus_bbox": yn(bx.get("artisjus", False)),
            "artisjus_parent_csv": yn(pkey in artisjus_csv),
            "eji": yn(bx.get("eji", False)),
            "gvl": yn(bx.get("gvl", False)),
            "mlc_unmatched": yn(bx.get("mlc_unmatched", False)),
            "mlc_unclaimed": yn(bx.get("mlc_unclaimed", False)),
            "credits_fm": "nincs_adat",
            "gap_score": 0,
            "teendo": "",
        }
        row["gap_score"] = gap_score(row)
        row["priority"] = priority(row)
        row["teendo"] = recommend(row)
        rows.append(row)

    order = {"P0": 0, "P1": 1, "P2": 2, "OK": 3}
    tier_order = {"high": 0, "medium": 1, "low": 2, "none": 3, "unknown": 4}

    def sort_key(r: dict) -> tuple:
        pop = r.get("spotify_popularity")
        try:
            pop_n = -int(pop) if pop not in ("", None) else 0
        except ValueError:
            pop_n = 0
        return (
            order.get(r["priority"], 9),
            tier_order.get(r.get("impact_tier", "unknown"), 9),
            pop_n,
            -r["gap_score"],
            r["parent_work"],
            r["title"],
        )

    rows.sort(key=sort_key)

    out_csv = DATA / "snyl_actionable_gaps.csv"
    fields = [
        "priority",
        "track_type",
        "parent_work",
        "title",
        "isrc",
        "release_date",
        "iswc_net",
        "iswc",
        "mlc_work",
        "mlc_song_code",
        "mlc_share",
        "mlc_writers",
        "mlc_publishers",
        "spotify_popularity",
        "impact_tier",
        "artisjus_bbox",
        "artisjus_parent_csv",
        "eji",
        "gvl",
        "mlc_unmatched",
        "mlc_unclaimed",
        "credits_fm",
        "teendo",
    ]
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    # gap category summary
    categories: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        if r["priority"] == "OK":
            continue
        if r["track_type"] == "snyL_remix" and r["artisjus_bbox"] == "nem" and r["artisjus_parent_csv"] == "nem":
            categories["remix_snyL_nincs_artisjus"].append(r)
        elif r["track_type"] == "remix_of_snyL" and r["artisjus_bbox"] == "nem" and r["iswc_net"] == "igen":
            categories["remix_sajat_iswc_van_artisjus_nem"].append(r)
        elif r["artisjus_bbox"] == "igen" and r["mlc_unmatched"] == "igen":
            categories["artisjus_es_mlc_unmatched"].append(r)
        elif r["iswc_net"] == "igen" and r["mlc_work"] == "nem":
            categories["iswc_van_mlc_nincs"].append(r)
        elif r["mlc_unmatched"] == "igen":
            categories["mlc_unmatched"].append(r)

    summary = {
        "total_tracks": len(rows),
        "p0": sum(1 for r in rows if r["priority"] == "P0"),
        "p1": sum(1 for r in rows if r["priority"] == "P1"),
        "p2": sum(1 for r in rows if r["priority"] == "P2"),
        "ok": sum(1 for r in rows if r["priority"] == "OK"),
        "by_track_type": dict(
            sorted(
                {k: sum(1 for r in rows if r["track_type"] == k) for k in {r["track_type"] for r in rows}}.items()
            )
        ),
        "gap_categories": {k: len(v) for k, v in sorted(categories.items())},
    }
    (DATA / "snyl_actionable_gaps_summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False))

    # parent-work rollup for big gaps
    by_parent: dict[str, dict] = {}
    for r in rows:
        p = r["parent_work"] or r["title"]
        if p not in by_parent:
            by_parent[p] = {
                "parent_work": p,
                "tracks": 0,
                "p0": 0,
                "artisjus": 0,
                "mlc_unmatched": 0,
                "no_iswc": 0,
                "remix_count": 0,
                "max_popularity": 0,
            }
        b = by_parent[p]
        b["tracks"] += 1
        try:
            b["max_popularity"] = max(b["max_popularity"], int(r.get("spotify_popularity") or 0))
        except ValueError:
            pass
        if r["priority"] == "P0":
            b["p0"] += 1
        if r["artisjus_bbox"] == "igen":
            b["artisjus"] += 1
        if r["mlc_unmatched"] == "igen":
            b["mlc_unmatched"] += 1
        if r["iswc_net"] == "nem" and r["track_type"] == "original":
            b["no_iswc"] += 1
        if r["track_type"] != "original":
            b["remix_count"] += 1

    rollup = sorted(
        by_parent.values(),
        key=lambda x: (-x["p0"], -x["max_popularity"], -x["artisjus"], -x["mlc_unmatched"], x["parent_work"]),
    )
    rollup_path = DATA / "snyl_actionable_by_work.csv"
    with rollup_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rollup[0].keys()) if rollup else [])
        w.writeheader()
        w.writerows(rollup)

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"Wrote {out_csv} ({len(rows)} rows)")
    print(f"Wrote {rollup_path} ({len(rollup)} parent works)")


if __name__ == "__main__":
    main()
