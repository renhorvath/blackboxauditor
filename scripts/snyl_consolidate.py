#!/usr/bin/env python3
"""SNYL / Ferenc Topa — multi-source catalog consolidation."""

from __future__ import annotations

import csv
import json
import re
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SYNC = Path("/Users/ren/synchreload")

# ISWC Net — IPI 00518140870 (user export 2026-06)
ISWC_NET = [
    ("T-007.029.056-0", "INFERNO"),
    ("T-007.078.538-4", "CIB"),
    ("T-007.134.618-3", "MESSAGE OF THE UNKNOWN"),
    ("T-007.134.619-4", "OVERDOZE"),
    ("T-007.116.877-8", "RECORDER"),
    ("T-007.169.073-7", "BAD TO THE BONE"),
    ("T-007.235.908-0", "ZEBRA ACID"),
    ("T-007.236.868-3", "ADDICTED"),
    ("T-007.236.869-4", "CHRISTINE"),
    ("T-007.236.870-7", "DIRTY SHADES OF GREY"),
    ("T-007.236.871-8", "FUNK FROM THE DEEP"),
    ("T-007.236.872-9", "HALFWAY TO SIDARI"),
    ("T-007.236.873-0", "IBIZA"),
    ("T-007.236.874-1", "LITTLE CLOSER TO ME (A)"),
    ("T-007.236.875-2", "NOT GETTING AWAY"),
    ("T-007.236.876-3", "ROCK ME"),
    ("T-007.236.877-4", "TAKE ME THERE"),
    ("T-007.238.067-6", "FROZEN DROPS OF RAIN"),
    ("T-007.240.519-6", "CLOSER (REELAUX EXTENDED MIX)"),
    ("T-007.240.520-9", "CLOSER (REELAUX RADIO EDIT)"),
    ("T-007.297.781-1", "IN CONTROL"),
    ("T-007.298.778-0", "NAMBA"),
    ("T-924.121.607-9", "REELAUX - THE ENDLESS SKY (TWO SUSPECTS REMIX)"),
    ("T-926.340.030-2", "BRAINSPIN"),
    ("T-926.341.261-9", "CANT HOLD THIS BACK"),
    ("T-007.320.294-4", "DARKNESS BETWEEN US"),
    ("T-007.320.295-5", "OUT OF TIME"),
    ("T-932.219.370-4", "CIAO"),
    ("T-932.219.371-5", "MANOKA"),
    ("T-932.219.372-6", "SLOWLY DRIFTS AWAY"),
    ("T-300.374.086-7", "ALONE"),
    ("T-302.813.938-6", "SCI FIED"),
    ("T-303.183.898-5", "FORGET THE PAST"),
    ("T-303.184.001-0", "FASCINATION"),
    ("T-303.184.007-6", "TURNING OF TIDES"),
    ("T-303.184.052-1", "BUILT TO LAST A DAY"),
    ("T-303.184.109-1", "IN MY HEAD"),
    ("T-304.780.952-5", "CHORDS STUFF"),
    ("T-304.780.955-8", "DAYLIGHT TO LATE NIGHT"),
    ("T-311.887.004-1", "FEEDBACK"),
    ("T-311.887.024-5", "SPACE SCOUT"),
    ("T-311.887.033-6", "EGO TRIPPING"),
    ("T-313.625.137-7", "CHORDS AND STUFF"),
    ("T-313.625.138-8", "NEVER TOO LATE - ORIGINAL MIX"),
    ("T-318.186.925-6", "INNOCENT SILENCE - INSTRUMENTAL"),
    ("T-318.186.927-8", "WINDJAMMER"),
    ("T-318.186.930-3", "FREE"),
    ("T-318.186.932-5", "ALGORITHM 35"),
    ("T-318.797.140-6", "GUILTY"),
    ("T-321.039.894-6", "BODY TO BODY"),
    ("T-321.039.895-7", "I FEEL YOU"),
    ("T-321.039.896-8", "GHOSTS OF THE DARK ROOM"),
    ("T-323.108.405-8", "ECLIPSE"),
    ("T-323.108.406-9", "UMBRA"),
    ("T-323.479.653-9", "LUST"),
    ("T-323.479.747-4", "SLOWLY DRIFTS AWAY - INSTRUMENTAL REMIX"),
    ("T-323.479.749-6", "SLOWLY DRIFTS AWAY - VOCAL REMIX"),
    ("T-324.085.703-4", "DUM - SNYL REMIX"),
    ("T-324.170.402-5", "NEW LIGHT FEAT. WELDON (ORIGINAL CLUB MIX)"),
    ("T-326.027.251-9", "EDEN - SNYL REMIX"),
    ("T-329.192.202-2", "BAJA"),
    ("T-329.192.204-4", "NO COUNTERFEIT"),
    ("T-330.304.596-3", "RESET YOUR MIND"),
    ("T-331.090.123-2", "WE ARE THE SUN"),
    ("T-331.524.887-0", "OBSESSION"),
    ("T-332.439.385-9", "SYNTHETIC DREAMS"),
    ("T-335.133.534-3", "I REMEMBER THOSE NIGHTS"),
    ("T-336.059.266-7", "RESET YOUR MIND (PAVEL PETROV REMIX)"),
    ("T-336.779.545-3", "ATTRACTION"),
    ("T-341.197.781-2", "APESH!T"),
    ("T-330.045.063-5", "SNYL, RYAN NASTY, AVES VOLARE - LUST (ORIGINAL MIX)"),
    ("T-313.871.435-5", "SNYL, TOUCHTALK, AVES VOLARE - RESISTANCE (DIRTY DOERING REM"),
    ("T-305.385.344-0", "LINES"),
    ("T-305.658.677-3", "BOYS & GIRLS"),
    ("T-329.448.145-7", "HORIZON"),
]


def norm_iswc(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (s or "").upper())


def norm_title(s: str) -> str:
    t = (s or "").upper()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(
        r"\b(ORIGINAL MIX|RADIO EDIT|STREAMING CUT|EXTENDED MIX|CLUB MIX|"
        r"INSTRUMENTAL|VOCAL REMIX|FEAT\.?|FT\.?|FEATURING|MIXED)\b",
        " ",
        t,
    )
    t = re.sub(r"\bSNYL\b", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    p = ROOT / ".env.local"
    if not p.exists():
        return env
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
    return env


def credits_batch(isrcs: list[str], api_key: str) -> dict[str, dict]:
    out: dict[str, dict] = {}
    headers = {"x-api-key": api_key, "Content-Type": "application/json", "Accept": "application/json"}
    for i in range(0, len(isrcs), 50):
        chunk = isrcs[i : i + 50]
        req = urllib.request.Request(
            "https://api.credits.fm/v1/batch",
            data=json.dumps({"isrcs": chunk}).encode(),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                data = json.loads(r.read())
            for isrc, row in (data.get("isrcs") or {}).items():
                out[isrc.upper()] = row
        except urllib.error.HTTPError:
            pass
    return out


def main() -> None:
    rows: dict[str, dict] = {}

    def bucket(key: str) -> dict:
        if key not in rows:
            rows[key] = {
                "norm_title": key,
                "titles": set(),
                "iswcs": set(),
                "mlc_codes": set(),
                "isrcs": set(),
                "flags": set(),
                "mlc_shares": [],
                "mlc_publishers": set(),
                "artisjus_mukod": set(),
                "spotify_count": 0,
                "bbox_unmatched": 0,
                "bbox_unclaimed": 0,
                "bbox_artisjus": 0,
                "bbox_eji": 0,
                "bbox_gvl": 0,
                "credits_matched": 0,
                "credits_unmatched": 0,
            }
        return rows[key]

    # ISWC Net
    for iswc, title in ISWC_NET:
        b = bucket(norm_title(title))
        b["titles"].add(title)
        b["iswcs"].add(norm_iswc(iswc))
        b["flags"].add("iswc_net")

    # MLC API
    mlc_path = DATA / "mlc_api_topa_works.csv"
    if mlc_path.exists():
        with mlc_path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                b = bucket(norm_title(r["title"]))
                b["titles"].add(r["title"])
                if r.get("iswc"):
                    b["iswcs"].add(norm_iswc(r["iswc"]))
                b["mlc_codes"].add(r["mlc_song_code"])
                b["flags"].add("mlc_api")
                if r.get("known_shares_pct"):
                    try:
                        b["mlc_shares"].append(float(r["known_shares_pct"]))
                    except ValueError:
                        pass
                if r.get("publishers"):
                    b["mlc_publishers"].add(r["publishers"].split(";")[0].strip())

    # Spotify SNYL catalog
    spotify_path = DATA / "snyl_catalog_snyl_only.csv"
    isrc_all: list[str] = []
    if spotify_path.exists():
        with spotify_path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                title = r.get("title", "")
                b = bucket(norm_title(title))
                b["titles"].add(title)
                b["spotify_count"] += 1
                b["flags"].add("spotify")
                isrc = (r.get("isrc") or "").strip().upper()
                if isrc:
                    b["isrcs"].add(isrc)
                    isrc_all.append(isrc)

    # bbox report
    bbox_path = DATA / "snyl_bbox_report_findings.csv"
    if bbox_path.exists():
        with bbox_path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                title = re.sub(r'^"+|"+$', "", r.get("title", ""))
                b = bucket(norm_title(title))
                b["titles"].add(title[:80])
                b["flags"].add("bbox")
                isrc = (r.get("isrc") or "").strip().upper()
                if isrc and not isrc.startswith("ARTISJUS") and not isrc.startswith("CMO"):
                    b["isrcs"].add(isrc)
                pbs = r.get("playbooks", "")
                if "unmatched_recording" in pbs:
                    b["bbox_unmatched"] += 1
                if "unclaimed_share" in pbs:
                    b["bbox_unclaimed"] += 1
                if "artisjus" in pbs:
                    b["bbox_artisjus"] += 1
                if "eji" in pbs:
                    b["bbox_eji"] += 1
                if "gvl" in pbs:
                    b["bbox_gvl"] += 1

    # Source-level counts (exact, from raw files — not bucket aggregates)
    source_counts: dict[str, int] = {
        "iswc_net_works": len(ISWC_NET),
        "mlc_api_song_codes": 0,
        "spotify_tracks": 0,
        "spotify_unique_isrc": 0,
        "bbox_findings": 0,
        "bbox_artisjus_findings": 0,
        "bbox_eji_findings": 0,
        "bbox_mlc_unmatched_findings": 0,
        "bbox_mlc_unclaimed_findings": 0,
        "bbox_gvl_findings": 0,
        "artisjus_csv_rows_topa_ferenc": 0,
        "artisjus_csv_unique_mukod": 0,
        "credits_fm_matched_isrc": 0,
        "credits_fm_unmatched_isrc": 0,
        "credits_fm_none_isrc": 0,
        "bbox_total_issues": 567,
    }
    if mlc_path.exists():
        with mlc_path.open(newline="", encoding="utf-8") as f:
            source_counts["mlc_api_song_codes"] = len(list(csv.DictReader(f)))
    if spotify_path.exists():
        with spotify_path.open(newline="", encoding="utf-8") as f:
            sp_rows = list(csv.DictReader(f))
        source_counts["spotify_tracks"] = len(sp_rows)
        source_counts["spotify_unique_isrc"] = len(
            {r["isrc"].strip().upper() for r in sp_rows if r.get("isrc")}
        )
    if bbox_path.exists():
        with bbox_path.open(newline="", encoding="utf-8") as f:
            bbox_rows = list(csv.DictReader(f))
        source_counts["bbox_findings"] = len(bbox_rows)
        for r in bbox_rows:
            pbs = r.get("playbooks", "")
            if "artisjus" in pbs:
                source_counts["bbox_artisjus_findings"] += 1
            if "eji" in pbs:
                source_counts["bbox_eji_findings"] += 1
            if "unmatched_recording" in pbs:
                source_counts["bbox_mlc_unmatched_findings"] += 1
            if "unclaimed_share" in pbs:
                source_counts["bbox_mlc_unclaimed_findings"] += 1
            if "gvl" in pbs:
                source_counts["bbox_gvl_findings"] += 1

    # Artisjus 2025 unique mű
    aj_path = SYNC / "artisjus_azonositatlan_muvek_2025.csv"
    if aj_path.exists():
        seen_mukod: set[str] = set()
        with aj_path.open(newline="", encoding="utf-8", errors="replace") as f:
            for r in csv.DictReader(f):
                if "TOPA FERENC" not in (r.get("jogosultak") or "").upper():
                    continue
                source_counts["artisjus_csv_rows_topa_ferenc"] += 1
                mukod = r.get("mukod", "")
                if mukod in seen_mukod:
                    continue
                seen_mukod.add(mukod)
                source_counts["artisjus_csv_unique_mukod"] = len(seen_mukod)
                title = r.get("mucim") or r.get("műcím") or ""
                if not title:
                    # fallback column names
                    for k, v in r.items():
                        if "cim" in k.lower() and v:
                            title = v
                            break
                b = bucket(norm_title(title))
                b["titles"].add(title)
                b["artisjus_mukod"].add(mukod)
                b["flags"].add("artisjus_2025")

    # credits.fm ISRC status
    env = load_env()
    api_key = env.get("CREDITS_FM_API_KEY", "")
    isrc_all = list(dict.fromkeys(isrc_all))[:190]
    cfm: dict[str, dict] = {}
    if api_key and isrc_all:
        cfm = credits_batch(isrc_all, api_key)
        for isrc, entry in cfm.items():
            title = entry.get("song_title") or entry.get("recording_title") or ""
            b = bucket(norm_title(title))
            if title:
                b["titles"].add(title)
            b["isrcs"].add(isrc)
            b["flags"].add("credits_fm")
            ms = (entry.get("match_status") or "").lower()
            if ms == "matched":
                b["credits_matched"] += 1
                source_counts["credits_fm_matched_isrc"] += 1
            elif ms == "unmatched":
                b["credits_unmatched"] += 1
                source_counts["credits_fm_unmatched_isrc"] += 1
            elif ms == "none":
                source_counts["credits_fm_none_isrc"] += 1
            if entry.get("iswc"):
                b["iswcs"].add(norm_iswc(entry["iswc"]))

    # merge buckets by shared ISWC
    iswc_map: dict[str, str] = {}
    for key, b in list(rows.items()):
        for iswc in b["iswcs"]:
            if iswc in iswc_map and iswc_map[iswc] != key:
                master = iswc_map[iswc]
                m, s = rows[master], b
                for field in (
                    "titles",
                    "iswcs",
                    "mlc_codes",
                    "isrcs",
                    "flags",
                    "mlc_publishers",
                    "artisjus_mukod",
                ):
                    m[field] |= s[field]
                m["mlc_shares"].extend(s["mlc_shares"])
                for f in (
                    "spotify_count",
                    "bbox_unmatched",
                    "bbox_unclaimed",
                    "bbox_artisjus",
                    "bbox_eji",
                    "bbox_gvl",
                    "credits_matched",
                    "credits_unmatched",
                ):
                    m[f] += s[f]
                del rows[key]
            elif iswc:
                iswc_map[iswc] = key

    # serialize
    out_rows: list[dict] = []
    for key, b in sorted(rows.items(), key=lambda x: sorted(x[1]["titles"])[0] if x[1]["titles"] else x[0]):
        shares = b["mlc_shares"]
        share_val = max(shares) if shares else ""
        partial = isinstance(share_val, (int, float)) and share_val < 99.9
        display_title = sorted(b["titles"], key=len)[0] if b["titles"] else key
        gaps: list[str] = []
        if "iswc_net" in b["flags"] and "mlc_api" not in b["flags"]:
            gaps.append("ISWC van, MLC API nem találta")
        if "mlc_api" in b["flags"] and not b["iswcs"] and shares:
            gaps.append("MLC regisztrálva, ISWC üres")
        if partial:
            gaps.append(f"MLC share {share_val}%")
        if b["bbox_unmatched"]:
            gaps.append("MLC unmatched ISRC")
        if b["bbox_unclaimed"]:
            gaps.append("MLC unclaimed")
        if b["bbox_artisjus"]:
            gaps.append("Artisjus (bbox)")
        elif b["artisjus_mukod"]:
            gaps.append("Artisjus (CSV)")
        if b["bbox_eji"]:
            gaps.append("EJI")
        if b["bbox_gvl"]:
            gaps.append("GVL")
        if b["spotify_count"] and "iswc_net" not in b["flags"] and "mlc_api" not in b["flags"]:
            gaps.append("Spotify only")

        out_rows.append(
            {
                "canonical_title": display_title,
                "iswc": ";".join(sorted(b["iswcs"])),
                "iswc_net": "Y" if "iswc_net" in b["flags"] else "",
                "mlc_api": "Y" if "mlc_api" in b["flags"] else "",
                "mlc_song_codes": ";".join(sorted(b["mlc_codes"])),
                "mlc_known_shares_pct": share_val,
                "mlc_partial_share": "Y" if partial else "",
                "mlc_publisher": ";".join(sorted(b["mlc_publishers"]))[:120],
                "spotify_tracks": b["spotify_count"],
                "isrc_count": len(b["isrcs"]),
                "bbox_mlc_unmatched": b["bbox_unmatched"],
                "bbox_mlc_unclaimed": b["bbox_unclaimed"],
                "bbox_artisjus": b["bbox_artisjus"],
                "artisjus_csv_mukod": len(b["artisjus_mukod"]),
                "bbox_eji": b["bbox_eji"],
                "bbox_gvl": b["bbox_gvl"],
                "credits_matched_isrc": b["credits_matched"],
                "credits_unmatched_isrc": b["credits_unmatched"],
                "gap_notes": " | ".join(gaps),
                "priority": (
                    "P0"
                    if (
                        b["bbox_artisjus"]
                        and (b["bbox_unmatched"] or b["credits_unmatched"])
                    )
                    or (partial and b["bbox_unmatched"])
                    else "P1"
                    if partial or b["bbox_unmatched"] or b["bbox_artisjus"] or b["artisjus_mukod"]
                    else "P2"
                ),
            }
        )

    out_csv = DATA / "snyl_consolidated_works.csv"
    fields = list(out_rows[0].keys()) if out_rows else []
    with out_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out_rows)

    summary = {
        "sources": source_counts,
        "consolidated_buckets": {
            "works_buckets": len(out_rows),
            "iswc_net_buckets": sum(1 for r in out_rows if r["iswc_net"] == "Y"),
            "mlc_api_buckets": sum(1 for r in out_rows if r["mlc_api"] == "Y"),
            "spotify_buckets": sum(1 for r in out_rows if int(r["spotify_tracks"] or 0) > 0),
            "iswc_and_mlc_buckets": sum(
                1 for r in out_rows if r["iswc_net"] == "Y" and r["mlc_api"] == "Y"
            ),
            "iswc_only_buckets": sum(
                1 for r in out_rows if r["iswc_net"] == "Y" and r["mlc_api"] != "Y"
            ),
            "mlc_only_buckets": sum(
                1 for r in out_rows if r["iswc_net"] != "Y" and r["mlc_api"] == "Y"
            ),
            "mlc_partial_share_buckets": sum(1 for r in out_rows if r["mlc_partial_share"] == "Y"),
            "mlc_no_iswc_buckets": sum(1 for r in out_rows if r["mlc_api"] == "Y" and not r["iswc"]),
            "bbox_artisjus_buckets": sum(1 for r in out_rows if int(r["bbox_artisjus"] or 0) > 0),
            "artisjus_csv_buckets": sum(1 for r in out_rows if int(r["artisjus_csv_mukod"] or 0) > 0),
            "spotify_only_buckets": sum(
                1
                for r in out_rows
                if int(r["spotify_tracks"] or 0) > 0
                and r["iswc_net"] != "Y"
                and r["mlc_api"] != "Y"
            ),
            "p0": sum(1 for r in out_rows if r["priority"] == "P0"),
            "p1": sum(1 for r in out_rows if r["priority"] == "P1"),
            "p2": sum(1 for r in out_rows if r["priority"] == "P2"),
        },
    }
    (DATA / "snyl_consolidated_summary.json").write_text(json.dumps(summary, indent=2))

    print(json.dumps(summary, indent=2))
    print(f"Wrote {out_csv} ({len(out_rows)} rows)")
    print("\n=== P0 ===")
    for r in out_rows:
        if r["priority"] == "P0":
            print(f"  {r['canonical_title'][:50]:50} | {r['gap_notes']}")
    print("\n=== ISWC Net, nincs MLC API ===")
    for r in out_rows:
        if r["iswc_net"] == "Y" and r["mlc_api"] != "Y":
            print(f"  {r['canonical_title'][:55]}")


if __name__ == "__main__":
    main()
