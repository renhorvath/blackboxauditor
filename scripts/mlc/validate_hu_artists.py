#!/usr/bin/env python3
"""Validate a seed list of Hungarian artists against Spotify (name match only)."""

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

from paths import data_dir, load_dotenv_local

MARKET = os.environ.get("SPOTIFY_DISCOGRAPHY_MARKET", "HU")
DEFAULT_SEED = data_dir() / "hu_100_artists_seed.csv"
DEFAULT_OVERRIDES = data_dir() / "hu_100_artists_overrides.csv"
DEFAULT_OUT = data_dir() / "hu_100_artists_validated.csv"

# Obvious wrong hits for short/common Hungarian names on Spotify search.
REJECT_SPOTIFY_IDS = {
    "0iEtIxbK0KxaSlF7G42ZOp",  # Metro Boomin for Metró
    "7GYGQbPxBVlemT6gxPs8Yk",  # Thai Taxi
    "3DHtfeD4PsmR9YGhCP4VF7",  # Nemzzz for NEMz
    "0vL0VbpI5Nb3zQFoLPL9Eo",  # Zséda és Demjén Ferenc
    "7n8dXkPFUAi1ABjHqdBCvr",  # Neoton Família Sztárjai
    "7uB1gJyQgeD9idb7h2VByx",  # egy5egy for Egyiptomi Lúzer
    "7Ac0uxdCzBBRgjbtel2bbV",  # VINI for Bináris Kód
    "6zqr73J6gm3Son1vnWkbfK",  # Kisé for Jazzkissa
    "3VgOKuwKvAYU4aT7atESfM",  # Nagy Bogi for Bence Bogár
    "0l1O7Poz32UpfUcdR3GxLE",  # Mudfield for The Butcher's Symphony
}


def normalize(value: str) -> str:
    value = (value or "").strip().upper()
    return re.sub(r"[^A-Z0-9]+", " ", value).strip()


def spotify_request(url: str, token: str) -> dict:
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
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
        return json.loads(resp.read().decode("utf-8"))["access_token"]


def classify_match(query: str, spotify_name: str) -> str:
    q = normalize(query)
    s = normalize(spotify_name)
    if q == s:
        return "exact"
    if q in s or s in q:
        return "fuzzy"
    q_tokens = set(q.split())
    s_tokens = set(s.split())
    if q_tokens and q_tokens <= s_tokens:
        return "fuzzy"
    if s_tokens and s_tokens <= q_tokens:
        return "fuzzy"
    return "weak"


def search_artist(name: str, token: str) -> tuple[dict | None, str]:
    params = urllib.parse.urlencode(
        {"q": name, "type": "artist", "limit": "8", "market": MARKET}
    )
    data = spotify_request(f"https://api.spotify.com/v1/search?{params}", token)
    items = data.get("artists", {}).get("items") or []
    if not items:
        return None, "not_found"

    target = normalize(name)
    for item in items:
        if normalize(item.get("name", "")) == target:
            return item, "exact"

    for item in items:
        cand = normalize(item.get("name", ""))
        if target in cand or cand in target:
            return item, "fuzzy"

    return items[0], "first_result"


def load_overrides(path: Path) -> dict[str, dict[str, str]]:
    if not path.exists():
        return {}
    with open(path, "r", encoding="utf-8", newline="") as f:
        rows = {r["query_name"].strip(): r for r in csv.DictReader(f) if r.get("query_name")}
    return rows


def artist_row(
    *,
    tier: str,
    query: str,
    status: str,
    match_type: str,
    spotify: dict | None,
    search_note: str,
) -> dict:
    if spotify:
        return {
            "tier": tier,
            "query_name": query,
            "status": status,
            "match_type": match_type,
            "spotify_id": spotify.get("id", ""),
            "spotify_name": spotify.get("name", ""),
            "followers": str(spotify.get("followers", {}).get("total", 0) or 0),
            "popularity": str(spotify.get("popularity", 0)),
            "genres": "; ".join((spotify.get("genres") or [])[:5]),
            "search_note": search_note,
            "tsv_search_name": spotify.get("name", query),
        }
    return {
        "tier": tier,
        "query_name": query,
        "status": status,
        "match_type": match_type,
        "spotify_id": "",
        "spotify_name": "",
        "followers": "",
        "popularity": "",
        "genres": "",
        "search_note": search_note,
        "tsv_search_name": query,
    }


def fetch_artist(spotify_id: str, token: str) -> dict:
    return spotify_request(f"https://api.spotify.com/v1/artists/{spotify_id}", token)


def main() -> None:
    load_dotenv_local()
    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "").strip()
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise SystemExit("SPOTIFY_CLIENT_ID és SPOTIFY_CLIENT_SECRET szükséges (.env.local)")

    parser = argparse.ArgumentParser(description="Validate HU artist seed list on Spotify")
    parser.add_argument("--seed", default=str(DEFAULT_SEED))
    parser.add_argument("--overrides", default=str(DEFAULT_OVERRIDES))
    parser.add_argument("--output", default=str(DEFAULT_OUT))
    args = parser.parse_args()

    token = get_token(client_id, client_secret)
    overrides = load_overrides(Path(args.overrides))
    rows_out: list[dict] = []

    with open(args.seed, "r", encoding="utf-8", newline="") as f:
        seeds = list(csv.DictReader(f))

    print(f"Validating {len(seeds)} artists…")
    for i, seed in enumerate(seeds, 1):
        query = (seed.get("query_name") or "").strip()
        tier = (seed.get("tier") or "").strip()
        if not query:
            continue

        override = overrides.get(query, {})
        action = (override.get("action") or "").strip()
        override_note = (override.get("note") or "").strip()

        if action == "tsv_only":
            rows_out.append(
                artist_row(
                    tier=tier,
                    query=query,
                    status="tsv_only",
                    match_type="manual",
                    spotify=None,
                    search_note=override_note or "manual_tsv_only",
                )
            )
            if i % 10 == 0:
                print(f"  {i}/{len(seeds)}…", flush=True)
            continue

        spotify = None
        search_note = ""
        match = ""

        if action == "override" and override.get("spotify_id"):
            try:
                spotify = fetch_artist(override["spotify_id"].strip(), token)
                match = classify_match(query, spotify.get("name", ""))
                search_note = override_note or "manual_override"
            except urllib.error.HTTPError as exc:
                search_note = f"override_http_{exc.code}"

        if not spotify:
            try:
                spotify, search_note = search_artist(query, token)
                if spotify and spotify.get("id") in REJECT_SPOTIFY_IDS:
                    search_note = f"rejected:{spotify.get('name','')}"
                    spotify = None
            except urllib.error.HTTPError as exc:
                search_note = f"http_{exc.code}"

        if spotify:
            match = match or classify_match(query, spotify.get("name", ""))
            if search_note == "first_result":
                match = "weak"
            needs_review = match == "weak" or search_note == "first_result"
            if action == "override":
                status = "validated"
                search_note = override_note or search_note or "manual_override"
            else:
                status = "validated" if match in ("exact", "fuzzy") and not needs_review else "review"
            rows_out.append(
                artist_row(
                    tier=tier,
                    query=query,
                    status=status,
                    match_type=match,
                    spotify=spotify,
                    search_note=search_note,
                )
            )
        else:
            rows_out.append(
                artist_row(
                    tier=tier,
                    query=query,
                    status="not_found",
                    match_type="",
                    spotify=None,
                    search_note=search_note,
                )
            )

        if i % 10 == 0:
            print(f"  {i}/{len(seeds)}…", flush=True)
        time.sleep(0.08)

    fields = [
        "tier",
        "query_name",
        "status",
        "match_type",
        "spotify_id",
        "spotify_name",
        "followers",
        "popularity",
        "genres",
        "search_note",
        "tsv_search_name",
    ]
    with open(args.output, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows_out)

    validated_n = sum(1 for r in rows_out if r["status"] == "validated")
    review_n = sum(1 for r in rows_out if r["status"] == "review")
    tsv_only_n = sum(1 for r in rows_out if r["status"] == "tsv_only")
    not_found_n = sum(1 for r in rows_out if r["status"] == "not_found")

    print(f"\nWrote {args.output}")
    print(f"  validated: {validated_n}")
    print(f"  review (gyenge match): {review_n}")
    print(f"  tsv_only (Spotify nincs, TSV név alapján): {tsv_only_n}")
    print(f"  not_found: {not_found_n}")

    if review_n:
        print("\nReview:")
        for r in rows_out:
            if r["status"] == "review":
                print(f"  {r['query_name']} → {r['spotify_name']} ({r['match_type']})")

    if tsv_only_n:
        print("\nTSV-only (név alapján keresendő):")
        for r in rows_out:
            if r["status"] == "tsv_only":
                print(f"  {r['query_name']} — {r['search_note']}")

    if not_found_n:
        print("\nNot found:")
        for r in rows_out:
            if r["status"] == "not_found":
                print(f"  {r['query_name']}")


if __name__ == "__main__":
    main()
