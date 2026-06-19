#!/usr/bin/env python3
"""Beatport catalog cross-check vs SNYL Spotify scrape — find missing tracks."""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
CATALOG_CSV = DATA / "snyl_catalog_snyl_only.csv"
sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(ROOT / "scripts"))

from client import BeatportClient, load_env, obtain_token  # noqa: E402
from snyl_scope import beatport_track_relevant  # noqa: E402

SEARCH_QUERIES = ["SNYL", "SNYL remix", "Ferenc Topa", "Snail Y"]
ARTIST_QUERIES = ["SNYL", "Ferenc Topa", "Snail Y"]


def norm_isrc(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def norm_title(value: str) -> str:
    s = (value or "").upper()
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def load_catalog() -> tuple[set[str], set[str], list[dict[str, str]]]:
    if not CATALOG_CSV.exists():
        raise SystemExit(f"Missing catalog: {CATALOG_CSV}")
    isrcs: set[str] = set()
    titles: set[str] = set()
    rows: list[dict[str, str]] = []
    with CATALOG_CSV.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append(r)
            if r.get("isrc"):
                isrcs.add(norm_isrc(r["isrc"]))
            t = norm_title(r.get("title", ""))
            if t:
                titles.add(t)
    return isrcs, titles, rows


def track_display_name(t: dict) -> str:
    name = t.get("name") or t.get("track_name") or ""
    mix = t.get("mix_name") or ""
    if mix and mix.lower() not in name.lower():
        return f"{name} ({mix})"
    return name


def artists_str(t: dict) -> str:
    parts: list[str] = []
    for key in ("artists", "artist"):
        val = t.get(key)
        if isinstance(val, list):
            for a in val:
                if isinstance(a, dict) and a.get("name"):
                    parts.append(a["name"])
                elif isinstance(a, str):
                    parts.append(a)
        elif isinstance(val, dict) and val.get("name"):
            parts.append(val["name"])
        elif isinstance(val, str):
            parts.append(val)
    if t.get("artist_name"):
        parts.append(str(t["artist_name"]))
    if t.get("remixers"):
        for r in t["remixers"]:
            if isinstance(r, dict) and r.get("name"):
                parts.append(r["name"])
    return "; ".join(dict.fromkeys(parts))


def is_relevant(t: dict) -> bool:
    blob = " ".join([artists_str(t), track_display_name(t), str(t.get("artist_name") or "")])
    return beatport_track_relevant(blob)


def extract_track_row(t: dict, source: str) -> dict[str, str]:
    tid = t.get("id") or t.get("track_id") or ""
    release = t.get("release") if isinstance(t.get("release"), dict) else {}
    label = ""
    if isinstance(release, dict):
        lbl = release.get("label")
        if isinstance(lbl, dict):
            label = lbl.get("name") or ""
    isrc = t.get("isrc") or ""
    pub = t.get("publish_date") or t.get("new_release_date") or ""
    if isinstance(release, dict) and not pub:
        pub = release.get("publish_date") or ""
    slug = t.get("slug") or ""
    url = f"https://www.beatport.com/track/{slug}/{tid}/" if slug and tid else ""
    return {
        "beatport_id": str(tid),
        "title": track_display_name(t),
        "artists": artists_str(t),
        "mix_name": t.get("mix_name") or "",
        "isrc": isrc,
        "isrc_norm": norm_isrc(isrc),
        "label": label,
        "publish_date": pub,
        "genre": (t.get("genre") or {}).get("name", "") if isinstance(t.get("genre"), dict) else "",
        "bpm": str(t.get("bpm") or ""),
        "beatport_url": url,
        "source": source,
    }


def add_track(all_rows: dict[str, dict[str, str]], t: dict, source: str) -> None:
    if not is_relevant(t):
        return
    tid = t.get("track_id") or t.get("id")
    if not tid:
        return
    all_rows[str(tid)] = extract_track_row(t, source)


def hydrate_missing_isrc(client: BeatportClient, rows: dict[str, dict[str, str]]) -> None:
    """Fetch full track only when search result lacked ISRC."""
    need = [bid for bid, r in rows.items() if not r.get("isrc_norm")]
    if not need:
        return
    print(f"Hydrating ISRC for {len(need)} tracks...", flush=True)
    for i, bid in enumerate(need, 1):
        try:
            full = client.get_track(int(bid))
            if is_relevant(full):
                rows[bid] = extract_track_row(full, rows[bid]["source"] + ";hydrate")
        except (RuntimeError, ValueError, TypeError):
            pass
        if i % 25 == 0:
            print(f"  hydrated {i}/{len(need)}", flush=True)


def collect_beatport_tracks(client: BeatportClient) -> list[dict[str, str]]:
    all_rows: dict[str, dict[str, str]] = {}
    artist_ids: set[int] = set()

    print("Searching artists...", flush=True)
    for q in ARTIST_QUERIES:
        for a in client.search(q, "artists", per_page=50):
            name = a.get("name") or a.get("artist_name") or ""
            aid = a.get("artist_id") or a.get("id")
            if aid and beatport_track_relevant(name):
                artist_ids.add(int(aid))
                print(f"  artist {aid}: {name}", flush=True)

    print("Searching tracks...", flush=True)
    for q in SEARCH_QUERIES:
        hits = client.search(q, "tracks", per_page=100)
        print(f"  {q!r}: {len(hits)} hits", flush=True)
        for t in hits:
            add_track(all_rows, t, f"search:{q}")

    for aid in sorted(artist_ids):
        print(f"Artist catalog {aid}...", flush=True)
        try:
            top = client.get_json(f"/catalog/artists/{aid}/top-10-tracks/", {"per_page": 100})
            batch = top.get("results") or top.get("data") or (top if isinstance(top, list) else [])
            for t in batch:
                add_track(all_rows, t, f"artist_top:{aid}")
        except RuntimeError as e:
            print(f"  top tracks skip: {e}", flush=True)

        try:
            page = 1
            while page <= 30:
                data = client.get_json(
                    "/catalog/tracks/",
                    {"artists": aid, "per_page": 100, "page": page, "order_by": "-publish_date"},
                )
                batch = data.get("results") or []
                if not batch:
                    break
                for t in batch:
                    add_track(all_rows, t, f"artist_catalog:{aid}")
                if not data.get("next"):
                    break
                page += 1
            print(f"  catalog pages: {page}", flush=True)
        except RuntimeError as e:
            print(f"  catalog skip: {e}", flush=True)

    print(f"Collected {len(all_rows)} unique Beatport tracks", flush=True)
    hydrate_missing_isrc(client, all_rows)
    return list(all_rows.values())


def classify_missing(
    bp_rows: list[dict[str, str]], known_isrcs: set[str], known_titles: set[str]
) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    missing: list[dict[str, str]] = []
    matched: list[dict[str, str]] = []
    for r in bp_rows:
        isrc = r.get("isrc_norm") or ""
        title = norm_title(r.get("title", ""))
        if isrc and isrc in known_isrcs:
            r["match_reason"] = "isrc"
            matched.append(r)
        elif title and title in known_titles:
            r["match_reason"] = "title"
            matched.append(r)
        else:
            r["match_reason"] = ""
            missing.append(r)
    missing.sort(key=lambda x: (x.get("publish_date") or "", x.get("title") or ""), reverse=True)
    return missing, matched


def main() -> None:
    env = load_env(ROOT)
    token_path = DATA / "beatport_token.json"
    token = obtain_token(env, token_path)
    client = BeatportClient(token)

    known_isrcs, known_titles, catalog_rows = load_catalog()
    print(
        f"Spotify baseline: {CATALOG_CSV.name} — {len(catalog_rows)} rows, "
        f"{len(known_isrcs)} ISRC, {len(known_titles)} titles",
        flush=True,
    )

    bp_rows = collect_beatport_tracks(client)
    print(f"Beatport relevant tracks: {len(bp_rows)}", flush=True)

    missing, matched = classify_missing(bp_rows, known_isrcs, known_titles)
    isrc_matches = sum(1 for r in matched if r.get("match_reason") == "isrc")
    title_matches = sum(1 for r in matched if r.get("match_reason") == "title")
    print(
        f"Matched: {len(matched)} (ISRC: {isrc_matches}, title: {title_matches}), "
        f"missing: {len(missing)}",
        flush=True,
    )

    out_all = DATA / "snyl_beatport_tracks.csv"
    out_missing = DATA / "snyl_beatport_missing.csv"
    out_summary = DATA / "snyl_beatport_crosscheck.json"

    fieldnames = [
        "beatport_id",
        "title",
        "artists",
        "mix_name",
        "isrc",
        "label",
        "publish_date",
        "genre",
        "bpm",
        "beatport_url",
        "source",
        "match_reason",
    ]

    for path, rows in ((out_all, bp_rows), (out_missing, missing)):
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
            w.writeheader()
            for r in rows:
                w.writerow(r)

    summary = {
        "catalog_file": str(CATALOG_CSV.name),
        "catalog_rows": len(catalog_rows),
        "catalog_isrcs": len(known_isrcs),
        "beatport_tracks": len(bp_rows),
        "matched": len(matched),
        "matched_by_isrc": isrc_matches,
        "matched_by_title": title_matches,
        "missing": len(missing),
        "missing_with_isrc": sum(1 for r in missing if r.get("isrc")),
        "missing_no_isrc": sum(1 for r in missing if not r.get("isrc")),
    }
    out_summary.write_text(json.dumps(summary, indent=2))

    print(f"Wrote {out_all}", flush=True)
    print(f"Wrote {out_missing}", flush=True)
    print(f"Wrote {out_summary}", flush=True)

    if missing:
        print("\n--- Missing tracks (first 20) ---", flush=True)
        for r in missing[:20]:
            print(
                f"  {r.get('publish_date','?'):10} | {r.get('isrc','—'):15} | "
                f"{r.get('title','')} | {r.get('label','')}",
                flush=True,
            )


if __name__ == "__main__":
    main()
