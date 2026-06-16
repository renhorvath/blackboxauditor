#!/usr/bin/env python3
"""One-time / incremental: GVL Sendemeldungen PDF → CSV (fast rebuild path)."""

from __future__ import annotations

import sys
from pathlib import Path

CMO_DIR = Path(__file__).resolve().parent
if str(CMO_DIR) not in sys.path:
    sys.path.insert(0, str(CMO_DIR))

from gvl_loaders import ensure_sendemeldungen_csv  # noqa: E402

PROJECT_ROOT = CMO_DIR.parents[1]
RAW = PROJECT_ROOT / "raw" / "cmo" / "de-gvl"
DERIVED = PROJECT_ROOT / "derived" / "cmo" / "de-gvl"


def main() -> None:
    force = "--force" in sys.argv
    if not RAW.is_dir():
        raise SystemExit(f"Missing GVL data: {RAW} (symlink ~/Downloads/gvl)")

    paths = ensure_sendemeldungen_csv(
        RAW,
        csv_dir=DERIVED / "sendemeldungen",
        text_cache_dir=DERIVED / "pdf-text",
        force=force,
    )
    if not paths:
        raise SystemExit("No GVL_Offene_Nutzungen_*.pdf in sendemeldungen/")
    print(f"Done — {len(paths)} CSV file(s) in {DERIVED / 'sendemeldungen'}")


if __name__ == "__main__":
    main()
