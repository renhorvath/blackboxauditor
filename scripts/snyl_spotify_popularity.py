#!/usr/bin/env python3
"""Fetch Spotify popularity for SNYL catalog tracks."""

from __future__ import annotations

import base64
import csv
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


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


def spotify_token(client_id: str, client_secret: str) -> str:
    basic = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=urllib.parse.urlencode({"grant_type": "client_credentials"}).encode(),
        method="POST",
        headers={"Authorization": f"Basic {basic}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())["access_token"]


def fetch_popularity(track_ids: list[str], token: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for i in range(0, len(track_ids), 50):
        chunk = track_ids[i : i + 50]
        qs = urllib.parse.urlencode({"ids": ",".join(chunk)})
        req = urllib.request.Request(
            f"https://api.spotify.com/v1/tracks?{qs}",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
        for t in data.get("tracks") or []:
            if t and t.get("id"):
                out[t["id"]] = int(t.get("popularity") or 0)
    return out


def main() -> None:
    env = load_env()
    cid, secret = env.get("SPOTIFY_CLIENT_ID"), env.get("SPOTIFY_CLIENT_SECRET")
    if not cid or not secret:
        raise SystemExit("SPOTIFY_CLIENT_ID/SECRET required")

    catalog = DATA / "snyl_catalog_snyl_only.csv"
    rows = list(csv.DictReader(catalog.open(newline="", encoding="utf-8")))
    ids = [r["spotify_id"] for r in rows if r.get("spotify_id")]
    token = spotify_token(cid, secret)
    pop = fetch_popularity(ids, token)

    out_rows: list[dict] = []
    for r in rows:
        sid = r.get("spotify_id") or ""
        p = pop.get(sid, "")
        out_rows.append(
            {
                "isrc": r.get("isrc", ""),
                "title": r.get("title", ""),
                "spotify_id": sid,
                "popularity": p,
                "impact_tier": (
                    "high" if isinstance(p, int) and p >= 50
                    else "medium" if isinstance(p, int) and p >= 20
                    else "low" if isinstance(p, int) and p >= 1
                    else "none" if p == 0
                    else "unknown"
                ),
            }
        )

    out = DATA / "snyl_spotify_popularity.csv"
    fields = ["isrc", "title", "spotify_id", "popularity", "impact_tier"]
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out_rows)

    with_pop = sum(1 for r in out_rows if r["popularity"] != "")
    print(f"tracks with spotify_id: {len(ids)}")
    print(f"popularity fetched: {with_pop}")
    print(f"high (>=50): {sum(1 for r in out_rows if r['impact_tier']=='high')}")
    print(f"medium (20-49): {sum(1 for r in out_rows if r['impact_tier']=='medium')}")
    print(f"Wrote {out}")


if __name__ == "__main__":
    main()
