#!/usr/bin/env node
/**
 * Build in-memory search index from ARTISJUS CSV (no native deps).
 *
 *   npm run artisjus:build-index
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function loadEnvLocal() {
  const envPath = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const csvPath =
  process.env.ARTISJUS_CSV_PATH ??
  path.join(projectRoot, "raw/cmo/hu-artisjus/artisjus_azonositatlan_muvek_2025.csv");
const outPath =
  process.env.ARTISJUS_INDEX_PATH ??
  path.join(projectRoot, "data", "artisjus-index.json");

const FOREIGN_TIPS = new Set(["KA", "KM"]);
const STOP = new Set([
  "the", "and", "feat", "ft", "featuring", "a", "an", "az", "egy", "es", "is",
  "of", "in", "on", "de", "la", "le", "les", "el", "y", "vs", "mix", "remix",
]);

function normalizeText(value) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFrom(value, minLen = 2) {
  return normalizeText(value)
    .split(" ")
    .filter((t) => t.length >= minLen && !STOP.has(t));
}

function pickLonger(a, b) {
  const sa = (a ?? "").trim();
  const sb = (b ?? "").trim();
  return sb.length > sa.length ? sb : sa;
}

function topN(counter, n = 8) {
  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function aggregateRows(rows) {
  const works = new Map();

  for (const row of rows) {
    const mukod = (row.mukod ?? "").trim();
    if (!/^400\d{7}$/.test(mukod)) continue;

    const feloRaw = (row.felo_tip ?? "").trim();
    const felo = feloRaw.split(/\s+/)[0] ?? "";
    const info = (row.elhangzasi_info ?? "").trim();
    const jog = (row.jogosultak ?? "").trim();

    let w = works.get(mukod);
    if (!w) {
      w = {
        mukod,
        mucim: "",
        eloadok: "",
        jogosultak: "",
        rowCount: 0,
        feloTips: new Set(),
        sources: new Map(),
        hasForeign: false,
        foreignOnly: true,
        hasRightsHolder: false,
      };
      works.set(mukod, w);
    }

    w.rowCount += 1;
    w.mucim = pickLonger(w.mucim, row.mucim);
    w.eloadok = pickLonger(w.eloadok, row.eloadok);
    w.jogosultak = pickLonger(w.jogosultak, row.jogosultak);
    if (felo) w.feloTips.add(felo);
    if (FOREIGN_TIPS.has(felo)) w.hasForeign = true;
    else if (felo) w.foreignOnly = false;
    if (jog) w.hasRightsHolder = true;
    if (info) {
      const key = info.length > 100 ? info.slice(0, 100) : info;
      w.sources.set(key, (w.sources.get(key) ?? 0) + 1);
    }
  }

  return works;
}

function buildTokenIndex(works) {
  /** @type {Record<string, number[]>} */
  const tokenIndex = {};

  works.forEach((work, idx) => {
    const blob = `${work.mucim} ${work.eloadok} ${work.jogosultak}`;
    const seen = new Set(tokensFrom(blob, 2));
    for (const tok of seen) {
      if (!tokenIndex[tok]) tokenIndex[tok] = [];
      tokenIndex[tok].push(idx);
    }
  });

  return tokenIndex;
}

function main() {
  if (!fs.existsSync(csvPath)) {
    console.error(`Missing CSV: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading ${csvPath} …`);
  const raw = fs.readFileSync(csvPath, "utf-8");
  const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true });

  const aggregated = aggregateRows(parsed.data);
  const works = [...aggregated.values()].map((w) => ({
    mukod: w.mukod,
    mucim: w.mucim || "(névtelen)",
    eloadok: w.eloadok,
    jogosultak: w.jogosultak,
    rowCount: w.rowCount,
    foreignOnly: w.foreignOnly,
    hasForeign: w.hasForeign,
    hasRightsHolder: w.hasRightsHolder,
    feloTips: [...w.feloTips].slice(0, 24),
    topSources: topN(w.sources, 8),
  }));

  console.log(`Building token index for ${works.length.toLocaleString()} works …`);
  const tokenIndex = buildTokenIndex(works);

  const payload = {
    version: 1,
    sourceCsv: path.basename(csvPath),
    builtAt: new Date().toISOString(),
    workCount: works.length,
    works,
    tokenIndex,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload));

  const sizeMb = fs.statSync(outPath).size / (1024 * 1024);
  console.log(`Wrote ${outPath} (${sizeMb.toFixed(1)} MB)`);
}

main();
