#!/usr/bin/env python3
"""Summarize per-ISRC platform spread and metadata conflicts."""

from __future__ import annotations

import csv
import re
from collections import defaultdict

from paths import conflicts_path, export_path, summary_path

SUMMARY_FIELDS = [
    "isrc",
    "canonical_artist",
    "canonical_title",
    "canonical_provider",
    "platforms_with_mismatch",
    "platform_count",
    "distinct_wrong_artists",
    "distinct_wrong_titles",
    "wrong_artists",
    "wrong_titles",
    "conflict_events",
    "severity_score",
]


def normalize(value: str) -> str:
    value = (value or "").strip().upper()
    return re.sub(r"\s+", " ", value)


def join_limited(values: set[str], limit: int = 5) -> str:
    ordered = sorted(v for v in values if v)
    if len(ordered) > limit:
        extra = len(ordered) - limit
        ordered = ordered[:limit]
        return "; ".join(ordered) + f" (+{extra} more)"
    return "; ".join(ordered)


def main() -> None:
    export_path_val = export_path()
    conflicts_path_val = conflicts_path()
    summary_path_val = summary_path()

    export = {}
    with open(export_path_val, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            isrc = row["isrc"].strip()
            if isrc:
                export[isrc] = row

    stats = defaultdict(lambda: {
        "platforms": set(),
        "wrong_artists": set(),
        "wrong_titles": set(),
        "conflict_events": 0,
    })

    with open(conflicts_path_val, "r", encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            isrc = row["isrc"].strip()
            if not isrc:
                continue

            item = stats[isrc]
            item["conflict_events"] += 1

            provider = row.get("provider", "").strip()
            if provider:
                item["platforms"].add(provider)

            field = row.get("field", "").strip()
            new_value = row.get("new_value", "").strip()
            original = row.get("original_value", "").strip()

            if not new_value:
                continue

            if field == "artist" and normalize(new_value) != normalize(original):
                item["wrong_artists"].add(new_value)
            elif field == "title" and normalize(new_value) != normalize(original):
                item["wrong_titles"].add(new_value)

    rows = []
    for isrc, base in export.items():
        item = stats.get(isrc, {
            "platforms": set(),
            "wrong_artists": set(),
            "wrong_titles": set(),
            "conflict_events": 0,
        })

        canonical_provider = base.get("provider", "").strip()
        platforms = set(item["platforms"])
        if canonical_provider:
            platforms.add(canonical_provider)

        platform_mismatch_count = len(item["platforms"])
        wrong_artist_count = len(item["wrong_artists"])
        wrong_title_count = len(item["wrong_titles"])
        severity = (
            platform_mismatch_count * 2
            + wrong_artist_count * 3
            + wrong_title_count * 3
            + item["conflict_events"]
        )

        rows.append({
            "isrc": isrc,
            "canonical_artist": base.get("artist", ""),
            "canonical_title": base.get("title", ""),
            "canonical_provider": canonical_provider,
            "platforms_with_mismatch": platform_mismatch_count,
            "platform_count": len(platforms),
            "distinct_wrong_artists": wrong_artist_count,
            "distinct_wrong_titles": wrong_title_count,
            "wrong_artists": join_limited(item["wrong_artists"]),
            "wrong_titles": join_limited(item["wrong_titles"]),
            "conflict_events": item["conflict_events"],
            "severity_score": severity,
        })

    rows.sort(key=lambda r: r["severity_score"], reverse=True)

    with open(summary_path_val, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=SUMMARY_FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    multi_platform = sum(1 for r in rows if r["platforms_with_mismatch"] > 1)
    multi_artist = sum(1 for r in rows if r["distinct_wrong_artists"] > 0)
    multi_title = sum(1 for r in rows if r["distinct_wrong_titles"] > 0)

    print(f"Wrote {len(rows):,} rows to {summary_path_val}")
    print(f"ISRCs with mismatches on 2+ platforms: {multi_platform:,}")
    print(f"ISRCs with wrong artist variants: {multi_artist:,}")
    print(f"ISRCs with wrong title variants: {multi_title:,}")
    print("\nTop 5 messiest ISRCs:")
    for row in rows[:5]:
        print(
            f"  {row['isrc']} | platforms={row['platforms_with_mismatch']} "
            f"| wrong artists={row['distinct_wrong_artists']} "
            f"| wrong titles={row['distinct_wrong_titles']} "
            f"| {row['canonical_artist']} — {row['canonical_title'][:50]}"
        )


if __name__ == "__main__":
    main()
