#!/usr/bin/env python3
"""Enrich Beatport-missing tracks: credits.fm, MLC title match, Spotify, append to catalog."""

from __future__ import annotations

import base64
import csv
import json
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
sys_path = Path(__file__).resolve().parent
import sys

sys.path.insert(0, str(sys_path))
sys.path.insert(0, str(ROOT / "scripts"))
from client import BeatportClient, load_env, obtain_token  # noqa: E402
from snyl_scope import is_feri_catalog_track  # noqa: E402

MISSING_CSV = DATA / "snyl_beatport_missing.csv"
CATALOG_CSV = DATA / "snyl_catalog_snyl_only.csv"
MLC_CSV = DATA / "mlc_api_topa_works.csv"
OUT_ENRICHED = DATA / "snyl_beatport_missing_enriched.csv"
OUT_SUMMARY = DATA / "snyl_beatport_missing_summary.json"


def norm_title(value: str) -> str:
    s = (value or "").upper()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def base_work(title: str) -> str:
    t = norm_title(title)
    for suffix in (
        "ORIGINAL MIX",
        "INSTRUMENTAL MIX",
        "RADIO EDIT",
        "EXTENDED MIX",
        "CLUB MIX",
        "DUB MIX",
        "SNYL REMIX",
        "REMIX",
        "MIXED",
        "MOB RMX",
        "M0B RMX",
    ):
        if t.endswith(" " + suffix):
            t = t[: -(len(suffix) + 1)].strip()
    return t


def pick_mlc(title: str, mlc_idx: dict[str, dict]) -> dict | None:
    keys = [norm_title(title), base_work(title)]
    for k in keys:
        if k in mlc_idx:
            return mlc_idx[k]
    parent = base_work(title)
    for mk, row in mlc_idx.items():
        if not mk or len(mk) < 4:
            continue
        if mk in parent or parent.startswith(mk) or parent.endswith(mk):
            return row
        if parent and parent in mk:
            return row
    return None


def load_mlc_index() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not MLC_CSV.exists():
        return out
    with MLC_CSV.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            key = norm_title(r["title"])
            out[key] = r
            bare = re.split(r"\s*-\s*", r["title"], maxsplit=1)[0]
            out.setdefault(norm_title(bare), r)
    return out


def credits_batch(isrcs: list[str], api_key: str) -> tuple[dict, dict, dict]:
    batch: dict = {}
    unmatched: dict = {}
    shares: dict = {}
    payload = json.dumps({"isrcs": isrcs}).encode()
    headers = {"x-api-key": api_key, "Content-Type": "application/json", "Accept": "application/json"}
    for ep, store in (
        ("batch", batch),
        ("audit/unmatched", unmatched),
        ("audit/shares", shares),
    ):
        url = f"https://api.credits.fm/v1/{ep}" if ep != "batch" else "https://api.credits.fm/v1/batch"
        body = {"isrcs": isrcs, "contribute": False} if ep == "batch" else {"isrcs": isrcs}
        req = urllib.request.Request(
            url,
            data=json.dumps(body).encode(),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = json.loads(r.read())
            if ep == "batch":
                store.update(data.get("isrcs") or {})
            else:
                for row in data.get("results") or []:
                    store[row["isrc"].upper()] = row
        except urllib.error.HTTPError:
            pass
    return batch, unmatched, shares


def spotify_token(env: dict[str, str]) -> str:
    basic = base64.b64encode(f"{env['SPOTIFY_CLIENT_ID']}:{env['SPOTIFY_CLIENT_SECRET']}".encode()).decode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=urllib.parse.urlencode({"grant_type": "client_credentials"}).encode(),
        method="POST",
        headers={"Authorization": f"Basic {basic}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())["access_token"]


def spotify_by_isrc(isrc: str, token: str) -> dict | None:
    qs = urllib.parse.urlencode({"q": f"isrc:{isrc}", "type": "track", "limit": 1, "market": "DE"})
    req = urllib.request.Request(
        f"https://api.spotify.com/v1/search?{qs}",
        headers={"Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            items = json.loads(resp.read()).get("tracks", {}).get("items") or []
        return items[0] if items else None
    except urllib.error.HTTPError:
        return None


def beatport_to_catalog_row(bp: dict, full: dict, enrich: dict) -> dict[str, str]:
    release = full.get("release") if isinstance(full.get("release"), dict) else {}
    label_obj = release.get("label") if isinstance(release.get("label"), dict) else {}
    title = bp.get("title") or full.get("name") or ""
    if full.get("mix_name") and full["mix_name"].lower() not in title.lower():
        title = f"{full['name']} - {full['mix_name']}"
    return {
        "title": title,
        "artists": bp.get("artists") or "",
        "isrc": bp.get("isrc") or "",
        "release_date": bp.get("publish_date") or release.get("publish_date") or "",
        "release_name": release.get("name") or "",
        "release_type": (release.get("type") or {}).get("name", "") if isinstance(release.get("type"), dict) else "",
        "label": bp.get("label") or label_obj.get("name") or "",
        "upc": release.get("upc") or "",
        "duration_ms": str(full.get("length_ms") or ""),
        "spotify_id": enrich.get("spotify_id") or "",
        "spotify_url": enrich.get("spotify_url") or "",
        "beatport_url": bp.get("beatport_url") or "",
        "gvl_produktionsnummer": "",
        "gvl_note": "",
        "mb_id": "",
        "sources": "beatport_missing",
        "roles": enrich.get("roles") or "primary",
    }


def main() -> None:
    env = load_env(ROOT)
    api_key = env.get("CREDITS_FM_API_KEY", "")
    token = obtain_token(env, DATA / "beatport_token.json")
    bp_client = BeatportClient(token)
    sp_token = spotify_token(env)
    mlc_idx = load_mlc_index()

    missing_rows = list(csv.DictReader(MISSING_CSV.open(newline="", encoding="utf-8")))
    # dedupe by ISRC
    by_isrc: dict[str, dict] = {}
    for r in missing_rows:
        isrc = (r.get("isrc") or "").strip().upper()
        if isrc and isrc not in by_isrc:
            by_isrc[isrc] = r

    isrcs = sorted(by_isrc)
    cfm_batch, cfm_um, cfm_sh = credits_batch(isrcs, api_key) if api_key else ({}, {}, {})

    enriched: list[dict] = []
    catalog_append: list[dict[str, str]] = []

    for isrc in isrcs:
        bp = by_isrc[isrc]
        bid = int(bp["beatport_id"])
        full = bp_client.get_track(bid)

        release = full.get("release") if isinstance(full.get("release"), dict) else {}
        label = bp.get("label") or ""
        if isinstance(release.get("label"), dict):
            label = label or release["label"].get("name") or ""

        cfm = cfm_batch.get(isrc) or cfm_batch.get(isrc.upper()) or {}
        um = cfm_um.get(isrc) or {}
        sh = cfm_sh.get(isrc) or {}

        mlc = pick_mlc(bp.get("title") or full.get("name") or "", mlc_idx)

        sp = spotify_by_isrc(isrc, sp_token)
        roles = "remix" if "remix" in (bp.get("title") or "").lower() else "primary"
        artists_blob = bp.get("artists") or ""
        if not is_feri_catalog_track(artists_blob, bp.get("title") or "", roles):
            print(f"  {isrc} | SKIP — not SNYL scope (e.g. Mr. Bizz solo)")
            continue

        row = {
            **bp,
            "isrc_norm": isrc,
            "release_name": release.get("name") or "",
            "upc": release.get("upc") or "",
            "catalog_number": release.get("catalog_number") or "",
            "duration_ms": str(full.get("length_ms") or ""),
            "bpm_full": str(full.get("bpm") or bp.get("bpm") or ""),
            "key": (full.get("key") or {}).get("name", "") if isinstance(full.get("key"), dict) else "",
            "label": label,
            "cfm_recording_title": cfm.get("recording_title") or um.get("recording_title") or "",
            "cfm_song_title": cfm.get("song_title") or "",
            "cfm_iswc": cfm.get("iswc") or um.get("iswc") or "",
            "cfm_match_status": um.get("match_status") or cfm.get("match_status") or "",
            "cfm_mlc_song_code": cfm.get("mlc_song_code") or "",
            "cfm_share_issue": sh.get("issue") or "",
            "cfm_writers": "; ".join(
                w.get("name", w) if isinstance(w, dict) else str(w)
                for w in (cfm.get("writers") or cfm.get("songwriters") or um.get("songwriters") or [])
            ),
            "mlc_song_code": mlc.get("mlc_song_code") if mlc else "",
            "mlc_work_title": mlc.get("title") if mlc else "",
            "mlc_iswc": mlc.get("iswc") if mlc else "",
            "mlc_known_shares_pct": mlc.get("known_shares_pct") if mlc else "",
            "mlc_partial_share": mlc.get("partial_share") if mlc else "",
            "mlc_writers": mlc.get("writers") if mlc else "",
            "mlc_publishers": mlc.get("publishers") if mlc else "",
            "mlc_recording_artists": mlc.get("recording_artists") if mlc else "",
            "mlc_match_note": "title_match" if mlc else "no_mlc_work_in_topa_89",
            "spotify_id": sp.get("id") if sp else "",
            "spotify_url": (sp.get("external_urls") or {}).get("spotify") if sp else "",
            "spotify_on_platform": "yes" if sp else "no",
        }
        enriched.append(row)
        catalog_append.append(
            beatport_to_catalog_row(
                bp,
                full,
                {"spotify_id": row["spotify_id"], "spotify_url": row["spotify_url"], "roles": roles},
            )
        )
        print(f"  {isrc} | MLC: {row['mlc_song_code'] or '—'} | credits: {row['cfm_match_status'] or '—'} | Spotify: {row['spotify_on_platform']}")

    # write enriched
    if enriched:
        fields = list(enriched[0].keys())
        with OUT_ENRICHED.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(enriched)

    # append to catalog (skip if ISRC already present)
    existing_isrcs: set[str] = set()
    catalog_rows: list[dict[str, str]] = []
    cat_fields = [
        "title", "artists", "isrc", "release_date", "release_name", "release_type",
        "label", "upc", "duration_ms", "spotify_id", "spotify_url", "beatport_url",
        "gvl_produktionsnummer", "gvl_note", "mb_id", "sources", "roles",
    ]
    if CATALOG_CSV.exists():
        with CATALOG_CSV.open(newline="", encoding="utf-8") as f:
            catalog_rows = list(csv.DictReader(f))
            for r in catalog_rows:
                if r.get("isrc"):
                    existing_isrcs.add(r["isrc"].strip().upper())

    added = 0
    for r in catalog_append:
        if not is_feri_catalog_track(r.get("artists", ""), r.get("title", ""), r.get("roles", "")):
            continue
        isrc = r["isrc"].strip().upper()
        if isrc in existing_isrcs:
            continue
        catalog_rows.append(r)
        existing_isrcs.add(isrc)
        added += 1

    with CATALOG_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cat_fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(catalog_rows)

    summary = {
        "missing_beatport_rows": len(missing_rows),
        "unique_isrcs": len(isrcs),
        "catalog_rows_added": added,
        "catalog_total": len(catalog_rows),
        "mlc_title_matches": sum(1 for r in enriched if r.get("mlc_song_code")),
        "cfm_in_db": sum(1 for r in enriched if r.get("cfm_match_status") not in ("", "not_in_db")),
        "cfm_unmatched": sum(1 for r in enriched if r.get("cfm_match_status") == "unmatched"),
        "cfm_not_in_db": sum(1 for r in enriched if r.get("cfm_match_status") == "not_in_db"),
        "spotify_found": sum(1 for r in enriched if r.get("spotify_on_platform") == "yes"),
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2))

    print(f"\nWrote {OUT_ENRICHED}")
    print(f"Added {added} rows to {CATALOG_CSV} (total {len(catalog_rows)})")
    print(f"Wrote {OUT_SUMMARY}")


if __name__ == "__main__":
    main()
