#!/usr/bin/env python3
"""
Spotify cross-check: Hungarian artists → ISRCs → HU prefix vs non-HU, optional TSV scan.

Validates the hypothesis that newer Hungarian artists often have non-HU ISRCs in MLC unmatched.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from paths import (
    export_path,
    load_dotenv_local,
    spotify_crosscheck_report_path,
    spotify_crosscheck_summary_path,
    tsv_path,
)

DEFAULT_ARTISTS = [
    "Carson Coma",
    "Azahriah",
    "Krubi",
    "Dzsúdló",
    "Halott Pénz",
    "MANUEL",
    "Wellhello",
    "Margaret Island",
    "Elefánt",
    "Soulwave",
    "Bohemian Betyars",
    "Lotfi Begi",
    "Bináris Kód",
    "4Street",
    "Valmar",
    "P.Mobil",
    "Omega",
    "Tankcsapda",
    "Quimby",
    "Ákos",
]

MIN_FIELDS = 20
MARKET = os.environ.get("SPOTIFY_DISCOGRAPHY_MARKET", "HU")


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().upper())


def spotify_request(url: str, token: str) -> dict:
    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get_token(client_id: str, client_secret: str) -> str:
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=urllib.parse.urlencode({"grant_type": "client_credentials"}).encode(),
        headers={
            "Authorization": f"Basic {basic}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["access_token"]


def search_artist_id(name: str, token: str) -> tuple[str, str] | None:
    params = urllib.parse.urlencode(
        {"q": name, "type": "artist", "limit": "5", "market": MARKET}
    )
    data = spotify_request(f"https://api.spotify.com/v1/search?{params}", token)
    items = data.get("artists", {}).get("items") or []
    if not items:
        return None
    # Prefer exact name match (case-insensitive)
    target = normalize(name)
    for item in items:
        if normalize(item.get("name", "")) == target:
            return item["id"], item.get("name", name)
    first = items[0]
    return first["id"], first.get("name", name)


def collect_artist_isrcs(artist_id: str, token: str, max_albums: int, max_tracks: int) -> list[dict]:
    album_ids: list[str] = []
    url: str | None = (
        f"https://api.spotify.com/v1/artists/{artist_id}/albums?"
        + urllib.parse.urlencode(
            {
                "include_groups": "album,single,compilation,appears_on",
                "limit": "50",
                "market": MARKET,
            }
        )
    )
    while url and len(album_ids) < max_albums:
        page = spotify_request(url, token)
        for album in page.get("items") or []:
            if len(album_ids) >= max_albums:
                break
            album_ids.append(album["id"])
        url = page.get("next") if len(album_ids) < max_albums else None

    track_ids: list[str] = []
    for album_id in album_ids:
        if len(track_ids) >= max_tracks:
            break
        tracks_url: str | None = (
            f"https://api.spotify.com/v1/albums/{album_id}/tracks?"
            + urllib.parse.urlencode({"limit": "50", "market": MARKET})
        )
        while tracks_url and len(track_ids) < max_tracks:
            tpage = spotify_request(tracks_url, token)
            for tr in tpage.get("items") or []:
                if len(track_ids) >= max_tracks:
                    break
                if tr.get("id"):
                    track_ids.append(tr["id"])
            tracks_url = tpage.get("next") if len(track_ids) < max_tracks else None

    rows: list[dict] = []
    for i in range(0, len(track_ids), 50):
        chunk = track_ids[i : i + 50]
        params = urllib.parse.urlencode({"ids": ",".join(chunk)})
        body = spotify_request(f"https://api.spotify.com/v1/tracks?{params}", token)
        for track in body.get("tracks") or []:
            if not track:
                continue
            isrc = (track.get("external_ids") or {}).get("isrc")
            if not isrc:
                continue
            rows.append(
                {
                    "spotify_track_id": track.get("id"),
                    "title": track.get("name", ""),
                    "isrc": isrc.upper(),
                    "album": (track.get("album") or {}).get("name", ""),
                }
            )
    return rows


def load_hu_export_isrcs(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    out: set[str] = set()
    with open(path, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            val = (row.get("isrc") or "").strip().upper()
            if val:
                out.add(val)
    return out


def scan_tsv_for_isrcs(isrcs: set[str], tsv: Path) -> dict[str, dict[str, str]]:
    found: dict[str, dict[str, str]] = {}
    with open(tsv, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader, None)
        if header and header[0].startswith("#"):
            header[0] = header[0].lstrip("#")
        for row in reader:
            if len(row) < MIN_FIELDS:
                continue
            isrc = row[2].strip().upper()
            if isrc not in isrcs or isrc in found:
                continue
            found[isrc] = {
                "isrc": isrc,
                "artist": row[8].strip(),
                "title": row[4].strip(),
                "provider": row[16].strip(),
            }
            if len(found) >= len(isrcs):
                break
    return found


def main() -> None:
    load_dotenv_local()
    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "").strip()
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise SystemExit("SPOTIFY_CLIENT_ID és SPOTIFY_CLIENT_SECRET szükséges (.env.local)")

    parser = argparse.ArgumentParser(description="Spotify HU artist ISRC cross-check")
    parser.add_argument(
        "--artists",
        default=",".join(DEFAULT_ARTISTS),
        help="Comma-separated artist names",
    )
    parser.add_argument("--max-albums", type=int, default=120)
    parser.add_argument("--max-tracks", type=int, default=800)
    parser.add_argument(
        "--scan-tsv",
        action="store_true",
        help="Scan full unmatched TSV for collected ISRCs (~45 min)",
    )
    parser.add_argument("--tsv", default=str(tsv_path()))
    args = parser.parse_args()

    token = get_token(client_id, client_secret)
    hu_export = load_hu_export_isrcs(export_path())
    artist_names = [a.strip() for a in args.artists.split(",") if a.strip()]

    report_rows: list[dict] = []
    all_isrcs: set[str] = set()

    for query_name in artist_names:
        print(f"Spotify: {query_name}…")
        try:
            match = search_artist_id(query_name, token)
        except urllib.error.HTTPError as exc:
            print(f"  Search failed: {exc.code}")
            continue
        if not match:
            print("  Not found")
            continue
        artist_id, resolved_name = match
        print(f"  → {resolved_name} ({artist_id})")

        try:
            tracks = collect_artist_isrcs(
                artist_id, token, args.max_albums, args.max_tracks
            )
        except urllib.error.HTTPError as exc:
            print(f"  Discography failed: {exc.code}")
            continue

        seen_local: set[str] = set()
        for tr in tracks:
            isrc = tr["isrc"]
            if isrc in seen_local:
                continue
            seen_local.add(isrc)
            all_isrcs.add(isrc)
            report_rows.append(
                {
                    "query_name": query_name,
                    "spotify_artist": resolved_name,
                    "spotify_artist_id": artist_id,
                    "track_title": tr["title"],
                    "album": tr["album"],
                    "isrc": isrc,
                    "is_hu_prefix": isrc.startswith("HU"),
                    "in_hu_export": isrc in hu_export,
                    "in_unmatched_tsv": "",
                    "mlc_artist": "",
                    "mlc_title": "",
                    "mlc_provider": "",
                }
            )
        print(f"  {len(seen_local)} unique ISRCs")
        time.sleep(0.2)

    tsv_hits: dict[str, dict[str, str]] = {}
    if args.scan_tsv and all_isrcs:
        print(f"Scanning TSV for {len(all_isrcs):,} ISRCs…")
        tsv_hits = scan_tsv_for_isrcs(all_isrcs, Path(args.tsv))
        for row in report_rows:
            hit = tsv_hits.get(row["isrc"])
            if hit:
                row["in_unmatched_tsv"] = "yes"
                row["mlc_artist"] = hit["artist"]
                row["mlc_title"] = hit["title"]
                row["mlc_provider"] = hit["provider"]
            else:
                row["in_unmatched_tsv"] = "no"

    report_path = spotify_crosscheck_report_path()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    fields = list(report_rows[0].keys()) if report_rows else []
    with open(report_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(report_rows)

    unique_isrcs = {r["isrc"] for r in report_rows}
    hu_prefix = {r["isrc"] for r in report_rows if r["is_hu_prefix"]}
    non_hu = unique_isrcs - hu_prefix
    in_export = {r["isrc"] for r in report_rows if r["in_hu_export"]}
    non_hu_not_in_export = non_hu - in_export
    in_tsv = set(tsv_hits.keys()) if tsv_hits else set()

    lines = [
        f"Artists queried: {len(artist_names)}",
        f"Track rows (with ISRC): {len(report_rows):,}",
        f"Unique ISRCs: {len(unique_isrcs):,}",
        f"  HU prefix: {len(hu_prefix):,}",
        f"  Non-HU prefix: {len(non_hu):,}",
        f"In existing hu_isrc export: {len(in_export):,}",
        f"Non-HU ISRCs NOT in hu export (candidate gap): {len(non_hu_not_in_export):,}",
    ]
    if args.scan_tsv:
        lines.append(f"In unmatched TSV: {len(in_tsv):,} unique ISRCs")
        non_hu_in_tsv = in_tsv - hu_prefix
        lines.append(f"  Non-HU prefix in TSV: {len(non_hu_in_tsv):,}")

    summary_path = spotify_crosscheck_summary_path()
    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print()
    for line in lines:
        print(line)
    print(f"\nReport: {report_path}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()
