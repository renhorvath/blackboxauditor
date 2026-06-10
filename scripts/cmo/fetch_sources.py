#!/usr/bin/env python3
"""Best-effort download of public CMO bulk files into raw/cmo/."""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW = PROJECT_ROOT / "raw" / "cmo"

# source_id -> list of (url, dest_filename)
DOWNLOADS: dict[str, list[tuple[str, str]]] = {
    "se-stim": [
        (
            "https://www.stim.se/api/files/file/stim_unregistered_works_latest.xlsx",
            "stim_unregistered_works_latest.xlsx",
        ),
    ],
    "sk-soza": [
        (
            "https://www.soza.sk/storage/Dokumenty%20-%20Autori/Neidentifikovan%C3%A9%20diela/"
            "UP_SV24_autori_verejnost_stav_k_2025_08_19.xlsx",
            "UP_SV24_autori_verejnost.xlsx",
        ),
    ],
    "fi-gramex": [
        (
            "https://www.gramex.fi/wp-content/uploads/placeholderit-radiosoitto-042026.xlsx",
            "radio-042026.xlsx",
        ),
        (
            "https://www.gramex.fi/wp-content/uploads/placeholderit-muut-042026.xlsx",
            "other-042026.xlsx",
        ),
    ],
    "hr-hds-zamp": [
        (
            "https://www.zamp.hr/uploads/Neidentificirana_MW_djela_l._244._st.6._ZAPSP-a.xlsx",
            "domestic.xlsx",
        ),
        (
            "https://www.zamp.hr/uploads/Neidentificirana_strana_MW_djela.xlsx",
            "foreign.xlsx",
        ),
    ],
    "ee-eel": [
        (
            "https://www.eel.ee/Registreerimata_esitused_%202020_2024.xlsx",
            "Registreerimata_esitused_2020_2024.xlsx",
        ),
    ],
    "cz-intergram": [
        (
            "https://www.intergram.cz/wp-content/uploads/2025/01/Neprirazene-snimky-2024.xlsx",
            "Neprirazene-snimky-2024.xlsx",
        ),
        (
            "https://www.intergram.cz/wp-content/uploads/2025/01/Neprirazene-snimky-2025.xlsx",
            "Neprirazene-snimky-2025.xlsx",
        ),
    ],
}


def fetch_one(source_id: str, url: str, filename: str, force: bool) -> str | None:
    dest_dir = RAW / source_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    if dest.is_file() and not force:
        return f"skip {dest} (exists)"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "BlackboxAuditor/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        dest.write_bytes(data)
        return f"ok {dest} ({len(data):,} bytes)"
    except urllib.error.HTTPError as err:
        return f"fail {source_id}/{filename}: HTTP {err.code} {url}"
    except Exception as err:
        return f"fail {source_id}/{filename}: {err}"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download CMO bulk files")
    parser.add_argument("--source", action="append", help="Limit to source id (repeatable)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing files")
    args = parser.parse_args()

    wanted = set(args.source) if args.source else set(DOWNLOADS)
    unknown = wanted - set(DOWNLOADS)
    for sid in sorted(unknown):
        print(f"unknown source: {sid}", file=sys.stderr)

    for sid in sorted(wanted & set(DOWNLOADS)):
        for url, name in DOWNLOADS[sid]:
            print(fetch_one(sid, url, name, args.force))


if __name__ == "__main__":
    main()
