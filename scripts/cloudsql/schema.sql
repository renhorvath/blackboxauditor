-- Meder CMO / ARTISJUS search indexes on Cloud SQL.
-- Apply as postgres: psql "$MEDER_POSTGRES_ADMIN_URL" -f scripts/cloudsql/schema.sql

CREATE SCHEMA IF NOT EXISTS meder;

CREATE TABLE IF NOT EXISTS meder.artisjus_works (
  idx INT PRIMARY KEY,
  record JSONB NOT NULL,
  search_tokens TEXT[] NOT NULL
);
CREATE INDEX IF NOT EXISTS artisjus_works_tokens_gin
  ON meder.artisjus_works USING GIN (search_tokens);

CREATE TABLE IF NOT EXISTS meder.cmo_records (
  source TEXT NOT NULL,
  idx INT NOT NULL,
  record JSONB NOT NULL,
  search_tokens TEXT[] NOT NULL,
  PRIMARY KEY (source, idx)
);
CREATE INDEX IF NOT EXISTS cmo_records_tokens_gin
  ON meder.cmo_records USING GIN (search_tokens);
CREATE INDEX IF NOT EXISTS cmo_records_source_idx
  ON meder.cmo_records (source);

CREATE TABLE IF NOT EXISTS meder.index_meta (
  source TEXT PRIMARY KEY,
  version INT,
  built_at TIMESTAMPTZ,
  record_count INT NOT NULL DEFAULT 0,
  loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA meder TO meder_loader, meder_ro;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA meder TO meder_loader;
GRANT SELECT ON ALL TABLES IN SCHEMA meder TO meder_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA meder
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO meder_loader;
ALTER DEFAULT PRIVILEGES IN SCHEMA meder
  GRANT SELECT ON TABLES TO meder_ro;
