#!/usr/bin/env npx tsx
/**
 * Load ARTISJUS + CMO (+ GVL) JSON indexes into Cloud SQL meder schema.
 *
 * Usage:
 *   npm run cloudsql:load-indexes
 *
 * Requires INDEX_LOADER_DATABASE_URL in .env.local
 */
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import pg from "pg";
import { loadDotenvLocal } from "../../lib/load-dotenv-local";
import {
  artisjusSearchBlob,
  cmoSearchBlob,
  uniqueTokens,
} from "../../lib/index-tokens";
import type { ArtisjusWork } from "../../lib/artisjus-types";
import type { CmoIndexFile, CmoRecord } from "../../lib/cmo-types";
import { cloudSqlPoolConfig } from "../../lib/index-db-config";

loadDotenvLocal();

function loaderUrl(): string {
  const url = process.env.INDEX_LOADER_DATABASE_URL?.trim();
  if (!url) {
    console.error("INDEX_LOADER_DATABASE_URL is not set");
    process.exit(1);
  }
  return url;
}

function artisjusPath(): string {
  return (
    process.env.ARTISJUS_INDEX_PATH?.trim() ||
    path.join(process.cwd(), "data", "artisjus-index.json")
  );
}

function cmoPath(): string {
  return (
    process.env.CMO_INDEX_PATH?.trim() ||
    path.join(process.cwd(), "data", "cmo-index.json")
  );
}

function gvlPath(): string {
  return (
    process.env.CMO_GVL_INDEX_PATH?.trim() ||
    path.join(process.cwd(), "data", "cmo-gvl-index.json")
  );
}

function escapeCopy(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function formatTextArray(tokens: string[]): string {
  if (tokens.length === 0) return "{}";
  return `{${tokens
    .map((t) => `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(",")}}`;
}

async function copyLines(
  client: pg.PoolClient,
  table: string,
  columns: string,
  lineIter: AsyncGenerator<string, void, unknown>,
): Promise<void> {
  const copyStream = client.query(copyFrom(`COPY ${table} (${columns}) FROM STDIN`));
  const readable = Readable.from(
    (async function* () {
      for await (const line of lineIter) {
        yield line.endsWith("\n") ? line : `${line}\n`;
      }
    })(),
  );
  await pipeline(readable, copyStream);
}

async function upsertMeta(
  client: pg.PoolClient,
  source: string,
  version: number | null,
  builtAt: string | null,
  recordCount: number,
): Promise<void> {
  await client.query(
    `INSERT INTO meder.index_meta (source, version, built_at, record_count, loaded_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (source) DO UPDATE SET
       version = EXCLUDED.version,
       built_at = EXCLUDED.built_at,
       record_count = EXCLUDED.record_count,
       loaded_at = now()`,
    [source, version, builtAt, recordCount],
  );
}

async function loadArtisjus(client: pg.PoolClient): Promise<void> {
  const file = artisjusPath();
  if (!fs.existsSync(file)) {
    console.warn(`Skip ARTISJUS — missing ${file}`);
    return;
  }
  console.log(`Loading ARTISJUS from ${file} …`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as {
    version?: number;
    builtAt?: string;
    works: ArtisjusWork[];
  };
  const works = raw.works ?? [];
  console.log(`  ${works.length.toLocaleString()} works`);

  await client.query("TRUNCATE meder.artisjus_works");

  await copyLines(
    client,
    "meder.artisjus_works",
    "idx, record, search_tokens",
    (async function* () {
      for (let idx = 0; idx < works.length; idx++) {
        const work = works[idx]!;
        const tokens = uniqueTokens(artisjusSearchBlob(work), 2);
        const json = escapeCopy(JSON.stringify(work));
        const arr = escapeCopy(formatTextArray(tokens));
        yield `${idx}\t${json}\t${arr}`;
        if ((idx + 1) % 50_000 === 0) {
          console.log(`  … ${(((idx + 1) / works.length) * 100).toFixed(0)}%`);
        }
      }
    })(),
  );

  await upsertMeta(client, "artisjus", raw.version ?? 1, raw.builtAt ?? null, works.length);
  console.log(`  ARTISJUS done (${works.length.toLocaleString()})`);
}

async function loadCmoFile(
  client: pg.PoolClient,
  file: string,
  label: string,
  truncateFirst: boolean,
): Promise<number> {
  if (!fs.existsSync(file)) {
    console.warn(`Skip ${label} — missing ${file}`);
    return 0;
  }
  console.log(`Loading ${label} from ${file} …`);
  const index = JSON.parse(fs.readFileSync(file, "utf8")) as CmoIndexFile;
  if (truncateFirst) {
    await client.query("TRUNCATE meder.cmo_records");
  }

  let total = 0;
  for (const [sourceId, src] of Object.entries(index.sources ?? {})) {
    if (!src?.records?.length) continue;
    console.log(`  ${sourceId}: ${src.records.length.toLocaleString()} records`);

    await client.query("DELETE FROM meder.cmo_records WHERE source = $1", [sourceId]);

    const records = src.records as CmoRecord[];
    await copyLines(
      client,
      "meder.cmo_records",
      "source, idx, record, search_tokens",
      (async function* () {
        for (let idx = 0; idx < records.length; idx++) {
          const record = records[idx]!;
          const tokens = uniqueTokens(cmoSearchBlob(record), 2);
          const json = escapeCopy(JSON.stringify(record));
          const arr = escapeCopy(formatTextArray(tokens));
          yield `${escapeCopy(sourceId)}\t${idx}\t${json}\t${arr}`;
          if ((idx + 1) % 100_000 === 0) {
            console.log(
              `    … ${sourceId} ${(((idx + 1) / records.length) * 100).toFixed(0)}%`,
            );
          }
        }
      })(),
    );

    await upsertMeta(
      client,
      sourceId,
      index.version ?? 1,
      index.builtAt ?? null,
      records.length,
    );
    total += records.length;
  }
  console.log(`  ${label} done (+${total.toLocaleString()})`);
  return total;
}

async function main() {
  const url = loaderUrl();
  const pool = new pg.Pool({
    ...cloudSqlPoolConfig(url),
    max: 1,
  });
  const client = await pool.connect();
  const t0 = Date.now();
  try {
    await client.query("SET statement_timeout = 0");
    await loadArtisjus(client);
    await loadCmoFile(client, cmoPath(), "CMO", true);
    await loadCmoFile(client, gvlPath(), "GVL", false);
    await client.query("ANALYZE meder.artisjus_works");
    await client.query("ANALYZE meder.cmo_records");

    const sizes = await client.query<{
      rel: string;
      size: string;
    }>(`
      SELECT relname AS rel, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'meder' AND c.relkind = 'r'
      ORDER BY pg_total_relation_size(c.oid) DESC
    `);
    console.log("\nTable sizes:");
    for (const row of sizes.rows) {
      console.log(`  ${row.rel}: ${row.size}`);
    }

    const meta = await client.query(
      `SELECT source, record_count FROM meder.index_meta ORDER BY source`,
    );
    console.log("\nSources:");
    for (const row of meta.rows) {
      console.log(`  ${row.source}: ${Number(row.record_count).toLocaleString()}`);
    }

    console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
