# MLC ETL — TSV → Parquet → DuckDB

One-time import on the data machine; replaces per-artist `ripgrep` scans over 120 GB TSV files.

## Prerequisites

```bash
.venv/bin/pip install -r scripts/etl/requirements.txt
```

Paths in `.env.local` (see `.env.example`):

- `MLC_UNMATCHED_TSV` — ~113 GB
- `MLC_UNCLAIMED_TSV` — ~7.6 GB
- `CATALOG_PARQUET_DIR` — default `./data/parquet`
- `CATALOG_DUCKDB_PATH` — default `./data/catalog.duckdb`

## Pipeline

```bash
# 1. TSV → Parquet (slow once; unmatched ~1–3 h depending on disk)
npm run etl:parquet
npm run etl:parquet -- --source unclaimed   # faster, start here to test

# 2. Parquet → DuckDB catalog
npm run etl:catalog

# 3. Query (milliseconds)
npm run etl:query -- --artist "Jazzbois"
npm run etl:query -- --isrc HU1234567890
```

## Output layout

```
data/
  parquet/
    mlc_unmatched.parquet
    mlc_unclaimed.parquet
  catalog.duckdb
```

## Next step (app integration)

The artist audit (`lib/mlc-artist-scan.ts`) automatically uses DuckDB when `data/catalog.duckdb` exists (or `CATALOG_DUCKDB_PATH`). Set `MLC_USE_DUCKDB=false` to force the legacy ripgrep path.
