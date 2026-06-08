#!/usr/bin/env python3
"""
Build a curated list of popular Hungarian artists (Spotify-first).

Rules (defaults):
- discovered artists: followers >= 10_000, market HU, exclude classical/folk genres
- legacy seed names: included when matched on Spotify (no follower floor)
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

from paths import hu_popular_artists_path, load_dotenv_local, mb_artists_json_path

MARKET = os.environ.get("SPOTIFY_DISCOGRAPHY_MARKET", "HU")
MIN_FOLLOWERS = 10_000

# Always try to resolve — régi nagy nevek, follower küszöb nélkül
LEGACY_SEED = (
    "Omega",
    "Tankcsapda",
    "Quimby",
    "Republic",
    "Locomotiv GT",
    "Zorán",
    "Demjén Ferenc",
    "Edda",
    "Beatrice",
    "Pokolgép",
    "Kalapács",
    "P.Mobil",
    "Kispál és a Borz",
    "Hooligans",
    "Ákos",
    "Neoton Família",
    "Bon-Bon",
    "Bikini",
    "Animal Cannibals",
    "Kowalsky meg a Vega",
    "Kredenc",
    "Magna Cum Lauder",
    "Egyiptomi Lúzer",
    "Csaknekedkislány",
    "Superbus",
    "Honeybeast",
    "Galaxisok",
    "Piramis",
    "Generál",
    "Illés",
    "LGT",
    "Tamás Cseh",
    "Charlie",
    "Máté Péter",
    "Caramel",
    "Radics Béla",
    "Bergendy",
    # +50 legacy bővítés
    "EDDA Művek",
    "Kormorán",
    "Koncz Zsuzsa",
    "Szikora Róbert",
    "Fenyő Miklós",
    "Lord",
    "Ossian",
    "Omen",
    "Moby Dick",
    "Európa Kiadó",
    "KFT",
    "Taxi",
    "Bródy János",
    "Skorpió",
    "Karthago",
    "P. Box",
    "Color",
    "Hungária",
    "Komár László",
    "Szűcs Judit",
    "Rúzsa Magdi",
    "Katalin Koncz",
    "V-Tech",
    "Soltész Betti",
    "Kati Kováts",
    "Kontroll Csoport",
    "Spions",
    "Trabant",
    "Bizalom",
    "Balázs Klári",
    "Első Emelet",
    "Romantika Együttes",
    "Junkies",
    "Fresh",
    "Middlemist Duella",
    "Brains",
    "Dorothy",
    "Hard",
    "Ismerős Arcok",
    "Presser Gábor",
    "Balázs Fecó",
    "Demjén Ferenc & Zenekar",
    "Neoton",
    "Szerencsés flottás",
    "P. Mobil",
    "Tarzan",
    "Kamikaze Luv",
    "Pannonia Allstars Ska",
    "TNT",
    "Korai Öröm",
    "Balaton",
    "Tarzan",
    "Madrász Elek",
    "Groovehouse",
)

# Modern / aktív — 10k follower küszöb
MODERN_SEED = (
    "Carson Coma",
    "Azahriah",
    "Krubi",
    "Krúbi",
    "Dzsúdló",
    "Halott Pénz",
    "Wellhello",
    "Margaret Island",
    "Soulwave",
    "Bohemian Betyars",
    "Bináris Kód",
    "Valmar",
    "4Street",
    "4s Street",
    "Elefánt",
    "Lotfi Begi",
    "MANUEL",
    "Alee",
    "Beton.Hofi",
    "BRS",
    "Lil Franck",
    "Moriones",
    "Punnany Massif",
    "Follow The Flow",
    "Csaknekedkislány",
    "Bagossy Brothers Company",
    "Cloud 9+",
    "Anima Sound System",
    "Belga",
    "HS7",
    "Irie Maffia",
    "Compact Disco",
    "New Level Empire",
    "Majka",
    "Curtis",
    "T.Danny",
    "Desh",
    "Saul",
    "Böbe",
    "Beton.Hofi",
    "Myrtill",
    "Jazzkissa",
    # +50 modern bővítés
    "Blahalouisiana",
    "Carbonfools",
    "NEMz",
    "Burai",
    "GWM",
    "Saiid",
    "USEF",
    "The Butcher's Symphony",
    "Fran Palermo",
    "JumoD",
    "DonDarius",
    "Dante",
    "Young G",
    "Ham Ko Ham",
    "A MASINA",
    "Piros Paprika",
    "Lóran Dávid",
    "Ghosts of Gambas",
    "Kelet",
    "Hori",
    "Beta Kids",
    "S10",
    "Galant",
    "YLLA",
    "Dánielfy",
    "Mordái",
    "Of Matter",
    "Žagar",
    "Neo",
    "Bence Bogár",
    "AWS",
    "Ismerős Arcok",
    "Konyha",
    "LeBron Hrnko",
    "Midiwar",
    "Antwon",
    "Wing",
    "ÜNFLV",
    "DL & Gm",
    "hiper",
    "Tape Delay",
    "Flamingo",
    "Pajamas",
    "Isonzo",
    "TWF",
    "Holdxc",
    "Renátó",
    "Renato",
    "Burai Krisztián",
    "Csobán Csaba",
    "Jibz",
    "JUMBO",
    "Pixie's Parasol",
)

PLAYLIST_HU_KEYWORDS = (
    "magyar",
    "hungary",
    "hungarian",
    "budapest",
    "debrecen",
    "szeged",
    "pest",
    " hu ",
    "top 50 magyar",
    "magyar top",
)


def load_mb_name_sets(path) -> tuple[set[str], list[str]]:
    if not path.is_file():
        return set(), []
    data = json.loads(path.read_text(encoding="utf-8"))
    exact: set[str] = set()
    long_names: list[str] = []
    for artist in data.get("artists") or []:
        for raw in [artist.get("name"), artist.get("sort_name"), *(artist.get("aliases") or [])]:
            if not raw:
                continue
            norm = normalize(raw)
            if len(norm) >= 3:
                exact.add(norm)
            if len(norm) >= 6:
                long_names.append(norm)
    long_names.sort(key=len, reverse=True)
    return exact, long_names


def matches_mb_hungary(artist_name: str, mb_exact: set[str], mb_long: list[str]) -> bool:
    norm = normalize(artist_name)
    if norm in mb_exact:
        return True
    for mb in mb_long:
        if mb in norm or norm in mb:
            return True
    return False


def is_hu_playlist(playlist: dict) -> bool:
    text = f"{playlist.get('name', '')} {playlist.get('description', '')}".lower()
    return any(k in text for k in PLAYLIST_HU_KEYWORDS)


PLAYLIST_QUERIES = (
    "Magyar Top 50",
    "Hungary Top 50",
    "Magyar sláger",
    "Hungary Viral",
    "Magyar playlist",
    "Fresh Hungary",
    "Magyar hip hop",
    "Magyar pop",
)

EXCLUDED_GENRE_KEYWORDS = (
    "classical",
    "orchestra",
    "orchestral",
    "symphony",
    "symphonic",
    "opera",
    "choral",
    "choir",
    "chamber",
    "baroque",
    "romantic era",
    "folk",
    "népzene",
    "world-traditional",
    "traditional folk",
    "celtic",
)


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


def is_classical_or_folk(genres: list[str]) -> bool:
    blob = " ".join(genres).lower()
    return any(k in blob for k in EXCLUDED_GENRE_KEYWORDS)


def search_artist(name: str, token: str) -> dict | None:
    params = urllib.parse.urlencode(
        {"q": name, "type": "artist", "limit": "8", "market": MARKET}
    )
    data = spotify_request(f"https://api.spotify.com/v1/search?{params}", token)
    items = data.get("artists", {}).get("items") or []
    if not items:
        return None

    target = normalize(name)
    for item in items:
        if normalize(item.get("name", "")) == target:
            return item

    # Fuzzy: query contained in name or vice versa (HU diacritics stripped via normalize)
    for item in items:
        cand = normalize(item.get("name", ""))
        if target in cand or cand in target:
            return item

    return items[0]


def get_artists_bulk(ids: list[str], token: str) -> list[dict]:
    out: list[dict] = []
    for i in range(0, len(ids), 50):
        chunk = ids[i : i + 50]
        params = urllib.parse.urlencode({"ids": ",".join(chunk)})
        body = spotify_request(f"https://api.spotify.com/v1/artists?{params}", token)
        out.extend(body.get("artists") or [])
        time.sleep(0.05)
    return out


def discover_from_playlists(token: str, max_playlists: int) -> set[str]:
    artist_ids: set[str] = set()
    seen_playlists: set[str] = set()

    for query in PLAYLIST_QUERIES:
        params = urllib.parse.urlencode(
            {"q": query, "type": "playlist", "limit": "10", "market": MARKET}
        )
        try:
            data = spotify_request(f"https://api.spotify.com/v1/search?{params}", token)
        except urllib.error.HTTPError:
            continue

        for pl in data.get("playlists", {}).get("items") or []:
            if not pl:
                continue
            pl_id = pl.get("id")
            if not pl_id or pl_id in seen_playlists:
                continue
            if not is_hu_playlist(pl):
                continue
            seen_playlists.add(pl_id)
            if len(seen_playlists) > max_playlists:
                break

            url: str | None = (
                f"https://api.spotify.com/v1/playlists/{pl_id}/tracks?"
                + urllib.parse.urlencode({"limit": "100", "market": MARKET, "fields": "items(track(artists(id)))"})
            )
            pages = 0
            while url and pages < 3:
                try:
                    page = spotify_request(url, token)
                except urllib.error.HTTPError:
                    break
                for item in page.get("items") or []:
                    track = item.get("track") or {}
                    for artist in track.get("artists") or []:
                        if artist.get("id"):
                            artist_ids.add(artist["id"])
                url = page.get("next")
                pages += 1
                time.sleep(0.05)

        time.sleep(0.1)

    return artist_ids


def spotify_matches_mb_query(spotify: dict, mb_name: str) -> bool:
    cand = normalize(spotify.get("name", ""))
    target = normalize(mb_name)
    if cand == target:
        return True
    if len(target) >= 5 and (target in cand or cand in target):
        return True
    return False


def discover_from_mb(
    token: str,
    mb_path: Path,
    add_artist,
    by_id: dict[str, dict],
    target_modern: int,
    target_legacy: int,
    min_followers: int,
) -> tuple[int, int]:
    if not mb_path.is_file():
        print("  MB index missing — run fetch_mb_hu_artists.py first")
        return 0, 0

    data = json.loads(mb_path.read_text(encoding="utf-8"))
    added_modern = 0
    added_legacy = 0
    scanned = 0

    for entry in data.get("artists") or []:
        if added_modern >= target_modern and added_legacy >= target_legacy:
            break
        name = (entry.get("name") or "").strip()
        if not name or len(name) < 2:
            continue
        scanned += 1
        try:
            spotify = search_artist(name, token)
        except urllib.error.HTTPError:
            continue
        if not spotify or not spotify.get("id"):
            continue
        if spotify["id"] in by_id:
            continue
        if not spotify_matches_mb_query(spotify, name):
            continue

        genres = spotify.get("genres") or []
        if is_classical_or_folk(genres):
            continue

        followers = spotify.get("followers", {}).get("total", 0) or 0
        before = len(by_id)

        if followers >= min_followers and added_modern < target_modern:
            add_artist(spotify, "mb_discovery", "modern", name)
        elif added_legacy < target_legacy:
            add_artist(spotify, "mb_discovery", "legacy", name)

        if len(by_id) > before:
            tier_added = by_id[spotify["id"]]["tier"]
            if tier_added == "modern":
                added_modern += 1
            elif tier_added == "legacy":
                added_legacy += 1

        if scanned % 200 == 0:
            print(
                f"  MB scan {scanned:,} | +modern {added_modern}/{target_modern} "
                f"+legacy {added_legacy}/{target_legacy}",
                flush=True,
            )
        time.sleep(0.07)

    return added_modern, added_legacy


def row_from_artist(artist: dict, source: str, tier: str, query_name: str = "") -> dict:
    genres = artist.get("genres") or []
    return {
        "spotify_id": artist.get("id", ""),
        "name": artist.get("name", ""),
        "followers": str(artist.get("followers", {}).get("total", 0)),
        "popularity": str(artist.get("popularity", 0)),
        "genres": "; ".join(genres[:5]),
        "source": source,
        "tier": tier,
        "query_name": query_name,
    }


def main() -> None:
    load_dotenv_local()
    client_id = os.environ.get("SPOTIFY_CLIENT_ID", "").strip()
    client_secret = os.environ.get("SPOTIFY_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise SystemExit("SPOTIFY_CLIENT_ID és SPOTIFY_CLIENT_SECRET szükséges (.env.local)")

    parser = argparse.ArgumentParser(description="Fetch popular Hungarian artists from Spotify")
    parser.add_argument("--min-followers", type=int, default=MIN_FOLLOWERS)
    parser.add_argument("--max-playlists", type=int, default=25)
    parser.add_argument(
        "--include-playlists",
        action="store_true",
        help="Also mine HU-named Spotify playlists (noisier; off by default)",
    )
    parser.add_argument(
        "--discover-mb",
        action="store_true",
        default=True,
        help="Search MusicBrainz HU artists on Spotify (default: on)",
    )
    parser.add_argument(
        "--no-discover-mb",
        action="store_false",
        dest="discover_mb",
        help="Skip MusicBrainz discovery pass",
    )
    parser.add_argument("--mb-modern-target", type=int, default=50)
    parser.add_argument("--mb-legacy-target", type=int, default=50)
    args = parser.parse_args()

    token = get_token(client_id, client_secret)
    mb_exact, mb_long = load_mb_name_sets(mb_artists_json_path())
    by_id: dict[str, dict] = {}

    def add_artist(artist: dict | None, source: str, tier: str, query_name: str = "") -> None:
        if not artist or not artist.get("id"):
            return
        genres = artist.get("genres") or []
        followers = artist.get("followers", {}).get("total", 0) or 0
        name = artist.get("name", "")

        if tier != "legacy" and is_classical_or_folk(genres):
            return
        if tier != "legacy" and followers < args.min_followers:
            return
        if tier == "discovered" and not matches_mb_hungary(name, mb_exact, mb_long):
            return

        aid = artist["id"]
        existing = by_id.get(aid)
        row = row_from_artist(artist, source, tier, query_name)
        if not existing or (tier == "legacy" and existing["tier"] != "legacy"):
            by_id[aid] = row

    print("Legacy seed…")
    for name in LEGACY_SEED:
        try:
            artist = search_artist(name, token)
            add_artist(artist, "legacy_seed", "legacy", name)
        except urllib.error.HTTPError as exc:
            print(f"  skip {name}: HTTP {exc.code}")
        time.sleep(0.08)

    print("Modern seed…")
    for name in MODERN_SEED:
        try:
            artist = search_artist(name, token)
            add_artist(artist, "modern_seed", "modern", name)
        except urllib.error.HTTPError as exc:
            print(f"  skip {name}: HTTP {exc.code}")
        time.sleep(0.08)

    print("Playlist discovery…")
    if args.include_playlists:
        playlist_ids = discover_from_playlists(token, args.max_playlists)
        print(f"  unique artist IDs from playlists: {len(playlist_ids):,}")
        artists = get_artists_bulk(list(playlist_ids), token)
        for artist in artists:
            if artist:
                add_artist(artist, "hu_playlist", "discovered")
    else:
        print("  skipped (use --include-playlists to enable)")

    if args.discover_mb:
        print(
            f"MusicBrainz discovery (target +{args.mb_modern_target} modern, "
            f"+{args.mb_legacy_target} legacy)…"
        )
        mb_mod, mb_leg = discover_from_mb(
            token,
            mb_artists_json_path(),
            add_artist,
            by_id,
            args.mb_modern_target,
            args.mb_legacy_target,
            args.min_followers,
        )
        print(f"  MB added: modern={mb_mod:,} legacy={mb_leg:,}")
    else:
        print("MusicBrainz discovery skipped")

    rows = sorted(
        by_id.values(),
        key=lambda r: (0 if r["tier"] == "legacy" else 1, -int(r["followers"])),
    )

    out = hu_popular_artists_path()
    fields = ["spotify_id", "name", "followers", "popularity", "genres", "source", "tier", "query_name"]
    with open(out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)

    legacy_n = sum(1 for r in rows if r["tier"] == "legacy")
    modern_n = sum(1 for r in rows if r["tier"] == "modern")
    disc_n = sum(1 for r in rows if r["tier"] == "discovered")
    mb_mod_n = sum(1 for r in rows if r["source"] == "mb_discovery" and r["tier"] == "modern")
    mb_leg_n = sum(1 for r in rows if r["source"] == "mb_discovery" and r["tier"] == "legacy")

    print(f"\nWrote {len(rows):,} artists → {out}")
    print(
        f"  legacy: {legacy_n:,} | modern: {modern_n:,} | playlist: {disc_n:,} | "
        f"mb: {mb_mod_n + mb_leg_n:,} (modern {mb_mod_n:,} + legacy {mb_leg_n:,})"
    )
    print(f"  min followers (non-legacy): {args.min_followers:,}")
    print("\nTop 15 by followers:")
    for row in sorted(rows, key=lambda r: -int(r["followers"]))[:15]:
        print(f"  {row['followers']:>10} | {row['name']} ({row['tier']})")


if __name__ == "__main__":
    main()
