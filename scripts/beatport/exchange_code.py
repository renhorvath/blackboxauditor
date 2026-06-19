#!/usr/bin/env python3
"""Exchange Beatportal authorization code for tokens (one-time browser flow)."""

from __future__ import annotations

import argparse
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client import _form_post, _save_token, load_env  # noqa: E402

TOKEN_URL = "https://api.beatport.com/v4/auth/o/token/"


def main() -> None:
    p = argparse.ArgumentParser(description="Beatport auth code → token")
    p.add_argument("code", help="Authorization code from redirect ?code=...")
    p.add_argument(
        "--redirect-uri",
        default="https://api.beatport.com/v4/auth/o/post-message",
        help="Must match OAuth app redirect URI",
    )
    args = p.parse_args()

    root = Path(__file__).resolve().parents[2]
    env = load_env(root)
    client_id = env.get("BEATPORT_CLIENT_ID", "").strip()
    if not client_id:
        raise SystemExit("BEATPORT_CLIENT_ID missing in .env.local")

    body = _form_post(
        TOKEN_URL,
        {
            "client_id": client_id,
            "code": args.code.strip(),
            "grant_type": "authorization_code",
            "redirect_uri": args.redirect_uri,
        },
    )
    token_path = root / "data" / "beatport_token.json"
    _save_token(token_path, body)
    print(f"Saved token to {token_path}")


if __name__ == "__main__":
    main()
