"""Resolve MLC Hungarian unmatched data paths from env or sensible defaults."""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_DIR = Path("/Users/ren/synchreload")
DEFAULT_TSV = Path("/Users/ren/autotrader/unmatchedresources.tsv")
ENV_LOCAL = PROJECT_ROOT / ".env.local"


def load_dotenv_local() -> None:
    """Load KEY=value lines from project .env.local into os.environ (if unset)."""
    if not ENV_LOCAL.is_file():
        return
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def data_dir() -> Path:
    raw = os.environ.get("MLC_HU_DATA_DIR", "").strip()
    return Path(raw) if raw else DEFAULT_DATA_DIR


def tsv_path() -> Path:
    raw = os.environ.get("MLC_UNMATCHED_TSV", "").strip()
    return Path(raw) if raw else DEFAULT_TSV


def export_path() -> Path:
    return data_dir() / "hungarian_unmatched_export.csv"


def conflicts_path() -> Path:
    return data_dir() / "hungarian_unmatched_conflicts.csv"


def summary_path() -> Path:
    return data_dir() / "hungarian_unmatched_isrc_summary.csv"


def changelog_path() -> Path:
    return data_dir() / "hungarian_unmatched_changelog.txt"


def mb_artists_json_path() -> Path:
    return data_dir() / "mb_hu_artists.json"


def mb_artist_names_path() -> Path:
    return data_dir() / "mb_hu_artist_names.txt"


def spotify_crosscheck_report_path() -> Path:
    return data_dir() / "spotify_hu_crosscheck_report.csv"


def spotify_crosscheck_summary_path() -> Path:
    return data_dir() / "spotify_hu_crosscheck_summary.txt"


def hu_popular_artists_path() -> Path:
    return data_dir() / "hu_popular_artists.csv"


def artisjus_unmatched_csv_path() -> Path:
    return data_dir() / "artisjus_azonositatlan_muvek.csv"
