"""Catalog paths for ETL (Parquet + DuckDB)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_MLC_DIR = Path(__file__).resolve().parents[1] / "mlc"
if str(_MLC_DIR) not in sys.path:
    sys.path.insert(0, str(_MLC_DIR))

from paths import (  # noqa: E402
    PROJECT_ROOT,
    load_dotenv_local,
    tsv_path,
    unclaimed_tsv_path,
)

from config import MLC_UNCLAIMED, MLC_UNMATCHED, SourceSpec  # noqa: E402

load_dotenv_local()


def parquet_dir() -> Path:
    raw = os.environ.get("CATALOG_PARQUET_DIR", "").strip()
    return Path(raw) if raw else PROJECT_ROOT / "data" / "parquet"


def catalog_db_path() -> Path:
    raw = os.environ.get("CATALOG_DUCKDB_PATH", "").strip()
    return Path(raw) if raw else PROJECT_ROOT / "data" / "catalog.duckdb"


def source_tsv(spec: SourceSpec) -> Path:
    if spec.id == MLC_UNMATCHED.id:
        return tsv_path()
    if spec.id == MLC_UNCLAIMED.id:
        return unclaimed_tsv_path()
    raise ValueError(f"Unknown source: {spec.id}")


def source_parquet(spec: SourceSpec) -> Path:
    return parquet_dir() / spec.parquet_name
