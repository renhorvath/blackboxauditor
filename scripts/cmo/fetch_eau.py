#!/usr/bin/env python3
"""Download EAÜ unidentified works CSV when the Estonian site is reachable.

EAÜ public site: https://eau.org (not eau.ee — the .ee host does not respond).
The research typo portal.eau.ee likely meant portal.eau.org (subdomain often unreachable off-EE networks).

Manual fallback:
  1. Open https://eau.org and navigate to the unidentified-works database (CSV export in UI)
  2. Or try https://portal.eau.org/unidentified if it resolves from your network
  3. Save as raw/cmo/ee-eau/unidentified.csv
  4. npm run cmo:build-index
"""

from __future__ import annotations

import argparse
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = PROJECT_ROOT / "raw" / "cmo" / "ee-eau"
OUT_FILE = OUT_DIR / "unidentified.csv"

# Pages and guessed export endpoints (best-effort; site may change).
CANDIDATE_URLS: tuple[str, ...] = (
    "https://eau.org/et/muusikaautorite-andmekogu/tuvastamata-teosed",
    "https://eau.org/en/music-authors-database/unidentified-works",
    "https://portal.eau.org/unidentified",
)


def fetch_url(url: str, timeout: int = 60) -> bytes:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "BlackboxAuditor/1.0 (+https://github.com/renhorvath/blackboxauditor)"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def find_csv_links(html: str) -> list[str]:
    links: list[str] = []
    for match in re.findall(r"""href=["']([^"']+)["']""", html, flags=re.I):
        low = match.lower()
        if ".csv" in low or "export" in low or "download" in low:
            if match.startswith("/"):
                links.append(f"https://eau.org{match}")
            elif match.startswith("http"):
                links.append(match)
    return links


def looks_like_csv(data: bytes) -> bool:
    if len(data) < 40:
        return False
    head = data[:4096].decode("utf-8", errors="replace").lower()
    return "," in head and any(k in head for k in ("title", "pealkiri", "mucim", "work", "isrc", "autor"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch EAÜ unidentified works CSV")
    parser.add_argument("--url", help="Direct CSV URL if known")
    parser.add_argument("--force", action="store_true", help="Overwrite existing file")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT_FILE.is_file() and not args.force:
        print(f"skip {OUT_FILE} (exists; use --force)")
        return

    if args.url:
        try:
            data = fetch_url(args.url)
        except Exception as err:
            print(f"fail: {err}", file=sys.stderr)
            sys.exit(1)
        if not looks_like_csv(data):
            print("fail: response does not look like CSV", file=sys.stderr)
            sys.exit(1)
        OUT_FILE.write_bytes(data)
        print(f"ok {OUT_FILE} ({len(data):,} bytes) from {args.url}")
        return

    errors: list[str] = []
    for page_url in CANDIDATE_URLS:
        try:
            html = fetch_url(page_url).decode("utf-8", errors="replace")
        except Exception as err:
            errors.append(f"{page_url}: {err}")
            continue
        for link in find_csv_links(html):
            try:
                data = fetch_url(link)
            except Exception as err:
                errors.append(f"{link}: {err}")
                continue
            if looks_like_csv(data):
                OUT_FILE.write_bytes(data)
                print(f"ok {OUT_FILE} ({len(data):,} bytes) from {link}")
                return
        errors.append(f"{page_url}: no CSV link in HTML")

    print("EAÜ CSV could not be downloaded automatically.", file=sys.stderr)
    for line in errors:
        print(f"  {line}", file=sys.stderr)
    print(__doc__, file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
