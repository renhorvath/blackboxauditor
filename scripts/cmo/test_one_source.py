#!/usr/bin/env python3
"""Load and report one CMO bulk source (smoke test)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

CMO_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(CMO_DIR))

from build_indexes import LOADERS  # noqa: E402


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: test_one_source.py <source-id>", file=sys.stderr)
        sys.exit(2)
    sid = sys.argv[1]
    if sid not in LOADERS:
        print(f"Unknown source: {sid}", file=sys.stderr)
        sys.exit(2)
    try:
        data = LOADERS[sid][3]()
        print(json.dumps({
            "source": sid,
            "ok": True,
            "recordCount": data["recordCount"],
            "organization": data["organization"],
            "sample": data["records"][:2],
        }, ensure_ascii=False, indent=2))
    except Exception as err:
        print(json.dumps({"source": sid, "ok": False, "error": str(err)}, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()
