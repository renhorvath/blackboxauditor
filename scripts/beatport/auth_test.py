#!/usr/bin/env python3
"""Verify Beatport OAuth credentials and print account info."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client import BeatportClient, load_env, obtain_token  # noqa: E402


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    env = load_env(root)
    token_path = root / "data" / "beatport_token.json"
    token = obtain_token(env, token_path)
    client = BeatportClient(token)

    print("OK — access token obtained")
    print(f"Token cached: {token_path}")

    try:
        account = client.get_json("/my/account/")
        print(json.dumps(account, indent=2))
    except RuntimeError as e:
        print(f"Account introspect skipped: {e}")

    # Quick search smoke test
    hits = client.search("SNYL", "tracks", per_page=3)
    print(f"\nSearch smoke test: {len(hits)} track hits for 'SNYL'")
    for h in hits[:3]:
        print(f"  - {h.get('track_name') or h.get('name')} ({h.get('artist_name')})")


if __name__ == "__main__":
    main()
