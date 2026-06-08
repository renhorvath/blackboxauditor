#!/usr/bin/env python3
"""Fetch Hungarian-area artists from MusicBrainz (Browse API + aliases)."""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

from paths import (
    load_dotenv_local,
    mb_artist_names_path,
    mb_artists_json_path,
)

# MusicBrainz area: Hungary (lookup via /ws/2/area?query=Hungary)
HUNGARY_AREA_MBID = "312bc5bb-7e43-3e63-81c6-b4d712b37b2c"

DEFAULT_USER_AGENT = "BlackboxAuditor/1.0 (ren@blackbox-auditor.local)"


def normalize(value: str) -> str:
    value = (value or "").strip().upper()
    return re.sub(r"\s+", " ", value)


def ascii_fold(value: str) -> str:
    import unicodedata

    nfkd = unicodedata.normalize("NFKD", value)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def fetch_page(offset: int, limit: int, user_agent: str) -> dict:
    params = urllib.parse.urlencode(
        {
            "area": HUNGARY_AREA_MBID,
            "limit": limit,
            "offset": offset,
            "inc": "aliases",
            "fmt": "json",
        }
    )
    url = f"https://musicbrainz.org/ws/2/artist?{params}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": user_agent,
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> None:
    load_dotenv_local()
    user_agent = os.environ.get("MUSICBRAINZ_USER_AGENT", DEFAULT_USER_AGENT)

    parser = argparse.ArgumentParser(description="Download MusicBrainz artists linked to Hungary")
    parser.add_argument("--limit", type=int, default=100, help="Page size (max 100)")
    parser.add_argument("--max-artists", type=int, default=0, help="Stop after N artists (0 = all)")
    parser.add_argument("--sleep", type=float, default=1.1, help="Seconds between API calls")
    args = parser.parse_args()

    limit = min(max(args.limit, 1), 100)
    all_artists: list[dict] = []
    name_variants: set[str] = set()
    offset = 0

    while True:
        try:
            data = fetch_page(offset, limit, user_agent)
        except urllib.error.HTTPError as exc:
            raise SystemExit(f"MusicBrainz HTTP {exc.code}: {exc.reason}") from exc

        artists = data.get("artists") or []
        if not artists:
            break

        for artist in artists:
            entry = {
                "id": artist.get("id"),
                "name": artist.get("name"),
                "sort_name": artist.get("sort-name"),
                "type": artist.get("type"),
                "disambiguation": artist.get("disambiguation"),
                "aliases": [
                    a.get("name")
                    for a in (artist.get("aliases") or [])
                    if a.get("name")
                ],
            }
            all_artists.append(entry)

            for raw in [entry["name"], entry["sort_name"], *entry["aliases"]]:
                if not raw:
                    continue
                norm = normalize(raw)
                if len(norm) >= 2:
                    name_variants.add(norm)
                folded = normalize(ascii_fold(raw))
                if len(folded) >= 2:
                    name_variants.add(folded)

        offset += len(artists)
        print(f"Fetched {len(all_artists):,} artists (offset {offset:,})…")

        if args.max_artists and len(all_artists) >= args.max_artists:
            all_artists = all_artists[: args.max_artists]
            break

        if len(artists) < limit:
            break

        time.sleep(args.sleep)

    out_json = mb_artists_json_path()
    out_names = mb_artist_names_path()
    out_json.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "area_mbid": HUNGARY_AREA_MBID,
        "artist_count": len(all_artists),
        "name_variant_count": len(name_variants),
        "artists": all_artists,
    }
    out_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    sorted_names = sorted(name_variants, key=len, reverse=True)
    out_names.write_text("\n".join(sorted_names) + "\n", encoding="utf-8")

    print(f"Wrote {len(all_artists):,} artists → {out_json}")
    print(f"Wrote {len(name_variants):,} name variants → {out_names}")


if __name__ == "__main__":
    main()
