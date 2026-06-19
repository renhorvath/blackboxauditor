#!/usr/bin/env python3
"""Print the public Beatport API client_id (from docs Swagger UI)."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from client import fetch_public_client_id  # noqa: E402


def main() -> None:
    cid = fetch_public_client_id()
    print("Public Beatport API client_id (from docs):")
    print(cid)
    print()
    print("Add to .env.local ONLY if auto-fetch fails:")
    print(f"BEATPORT_CLIENT_ID={cid}")


if __name__ == "__main__":
    main()
