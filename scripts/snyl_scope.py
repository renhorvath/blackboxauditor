"""SNYL / Ferenc Topa catalog scope — exclude unrelated Mr. Bizz solo releases."""

from __future__ import annotations

import re

# Mr. Bizz is a separate artist; only tracks with SNYL credit belong in Feri's audit.
MR_BIZZ_RE = re.compile(r"\bmr\.?\s*bizz\b", re.I)
SNYL_RE = re.compile(r"\bsnyl\b", re.I)
SNYL_REMIX_RE = re.compile(r"\bsnyl\s+(remix|re-edit|edit)\b", re.I)


def is_mr_bizz_solo(artists: str, title: str = "") -> bool:
    """True when Mr. Bizz appears without any SNYL credit."""
    blob = f"{artists or ''} {title or ''}"
    return bool(MR_BIZZ_RE.search(blob)) and not bool(SNYL_RE.search(artists or ""))


def is_feri_catalog_track(artists: str, title: str = "", roles: str = "") -> bool:
    """Tracks that belong in SNYL / Topa Ferenc audit scope."""
    if is_mr_bizz_solo(artists, title):
        return False
    if SNYL_RE.search(artists or ""):
        return True
    if SNYL_REMIX_RE.search(title or ""):
        return True
    if "spotify_mr_bizz" in (roles or ""):
        return False
    return False


def beatport_track_relevant(blob: str) -> bool:
    """Beatport relevance — SNYL / Ferenc Topa, not standalone Mr. Bizz catalog."""
    if is_mr_bizz_solo(blob):
        return False
    return bool(
        re.search(r"\bsnyl\b|mr\.?\s*snyl\s*bizz|snail\s*y|ferenc\s+topa", blob, re.I)
    )


def prune_catalog_file(path) -> int:
    """Remove out-of-scope rows from a catalog CSV; returns rows removed."""
    import csv
    from pathlib import Path

    p = Path(path)
    if not p.exists():
        return 0
    with p.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
        fields = rows[0].keys() if rows else []
    kept = [
        r
        for r in rows
        if is_feri_catalog_track(r.get("artists", ""), r.get("title", ""), r.get("roles", ""))
    ]
    removed = len(rows) - len(kept)
    if removed:
        with p.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(kept)
    return removed


if __name__ == "__main__":
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "data"
    for name in ("snyl_catalog_snyl_only.csv", "snyl_catalog_scrape.csv"):
        n = prune_catalog_file(root / name)
        print(f"{name}: removed {n} rows")
