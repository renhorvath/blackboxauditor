#!/usr/bin/env npx tsx
/**
 * Stream UCMR-ADA works CSV → Cloud SQL meder.cmo_records (source=ro-ucmr-ada).
 *
 * Avoids building a ~300MB JSON index. Caps poison PDF fields at 500 chars.
 *
 * Usage:
 *   npm run cloudsql:load-ucmr
 *
 * Requires INDEX_LOADER_DATABASE_URL in .env.local
 * CSV: raw/cmo/ro-ucmr-ada/unidentified.csv (or UCMR_CSV_PATH)
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import pg from "pg";
import { loadDotenvLocal } from "../../lib/load-dotenv-local";
import { cmoSearchBlob, uniqueTokens } from "../../lib/index-tokens";
import type { CmoRecord } from "../../lib/cmo-types";
import { cloudSqlPoolConfig } from "../../lib/index-db-config";

loadDotenvLocal();

const SOURCE_ID = "ro-ucmr-ada";
const FIELD_CAP = 500;
const POISON_THRESHOLD = 10_000;

function loaderUrl(): string {
  const url = process.env.INDEX_LOADER_DATABASE_URL?.trim();
  if (!url) {
    console.error("INDEX_LOADER_DATABASE_URL is not set");
    process.exit(1);
  }
  return url;
}

function csvPath(): string {
  const fromEnv = process.env.UCMR_CSV_PATH?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "raw", "cmo", "ro-ucmr-ada", "unidentified.csv");
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

function capField(value: string): string {
  if (value.length <= FIELD_CAP) return value;
  return value.slice(0, FIELD_CAP).trimEnd();
}

/** Minimal CSV line parser (RFC4180-ish) for streaming huge cells. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function buildIdentification(performer: string, composer: string): string {
  const parts = [composer, performer].filter(Boolean);
  return parts.join(" · ");
}

async function copyLines(
  client: pg.PoolClient,
  lineIter: AsyncGenerator<string, void, unknown>,
): Promise<void> {
  const copyStream = client.query(
    copyFrom("COPY meder.cmo_records (source, idx, record, search_tokens) FROM STDIN"),
  );
  const readable = Readable.from(
    (async function* () {
      for await (const line of lineIter) {
        yield line.endsWith("\n") ? line : `${line}\n`;
      }
    })(),
  );
  await pipeline(readable, copyStream);
}

async function* iterCopyRows(
  file: string,
): AsyncGenerator<{ line: string; poison: boolean }, void, unknown> {
  const stream = fs.createReadStream(file, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let headers: string[] | null = null;
  let idx = 0;
  const seen = new Set<string>();
  let poisonCount = 0;

  for await (const rawLine of rl) {
    if (!headers) {
      headers = parseCsvLine(rawLine.replace(/^\uFEFF/, "")).map((h) => h.trim().toLowerCase());
      continue;
    }
    if (!rawLine.trim()) continue;

    const cols = parseCsvLine(rawLine);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]!] = (cols[i] ?? "").trim();
    }

    const titleRaw = row.title ?? "";
    const authorRaw = row.author ?? "";
    const artistRaw = row.artist ?? "";
    const identRaw = row.identification ?? "";
    const maxLen = Math.max(titleRaw.length, authorRaw.length, artistRaw.length, identRaw.length);
    const poison = maxLen > POISON_THRESHOLD;
    if (poison) poisonCount++;

    const title = capField(titleRaw);
    const composer = capField(authorRaw);
    const performer = capField(artistRaw);
    let identification = capField(identRaw);
    if (!identification) {
      identification = capField(buildIdentification(performer, composer));
    }
    if (!title && !identification) continue;

    const recId = (row.id || "").trim() || `ucmr:${idx}`;
    if (seen.has(recId)) continue;
    seen.add(recId);

    const record: CmoRecord = {
      id: recId,
      source: SOURCE_ID,
      title: title || "(névtelen)",
      identification,
      remark: capField(row.remark ?? "") || null,
    };
    if (performer) record.performer = performer;
    if (composer) record.composer = composer;

    const tokens = uniqueTokens(cmoSearchBlob(record), 2);
    const json = escapeCopy(JSON.stringify(record));
    const arr = escapeCopy(formatTextArray(tokens));
    const line = `${escapeCopy(SOURCE_ID)}\t${idx}\t${json}\t${arr}`;
    idx++;
    yield { line, poison };

    if (idx % 100_000 === 0) {
      console.log(`  … ${idx.toLocaleString()} rows (poison so far: ${poisonCount})`);
    }
  }

  console.log(
    `  streamed ${idx.toLocaleString()} records; poison fields (>${POISON_THRESHOLD}): ${poisonCount}`,
  );
}

async function main() {
  const file = csvPath();
  if (!fs.existsSync(file)) {
    console.error(`Missing UCMR CSV: ${file}`);
    process.exit(1);
  }
  console.log(`Loading UCMR-ADA from ${file} → meder.cmo_records (${SOURCE_ID})`);

  const pool = new pg.Pool({
    ...cloudSqlPoolConfig(loaderUrl()),
    max: 1,
  });
  const client = await pool.connect();
  const t0 = Date.now();
  try {
    await client.query("SET statement_timeout = 0");
    await client.query("BEGIN");
    await client.query("DELETE FROM meder.cmo_records WHERE source = $1", [SOURCE_ID]);
    const left = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM meder.cmo_records WHERE source = $1`,
      [SOURCE_ID],
    );
    if (Number(left.rows[0]?.n) !== 0) {
      throw new Error(`Expected 0 ${SOURCE_ID} rows after DELETE, got ${left.rows[0]?.n}`);
    }

    let count = 0;
    await copyLines(client, (async function* () {
      for await (const { line } of iterCopyRows(file)) {
        count++;
        yield line;
      }
    })());

    await client.query(
      `INSERT INTO meder.index_meta (source, version, built_at, record_count, loaded_at)
       VALUES ($1, $2, now(), $3, now())
       ON CONFLICT (source) DO UPDATE SET
         version = EXCLUDED.version,
         built_at = EXCLUDED.built_at,
         record_count = EXCLUDED.record_count,
         loaded_at = now()`,
      [SOURCE_ID, 2, count],
    );
    await client.query("COMMIT");

    await client.query("ANALYZE meder.cmo_records");

    const check = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM meder.cmo_records WHERE source = $1`,
      [SOURCE_ID],
    );
    console.log(`DB count ${SOURCE_ID}: ${Number(check.rows[0]?.n).toLocaleString()}`);
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
