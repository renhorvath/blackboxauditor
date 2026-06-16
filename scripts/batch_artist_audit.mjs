#!/usr/bin/env node
/**
 * Batch artist audit summary (MLC unmatched + unclaimed, ARTISJUS, CMO).
 * Usage: node scripts/batch_artist_audit.mjs [--publish] "Artist 1" "Artist 2" ...
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

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

const { runArtistAudit } = await import("../lib/artist-audit.ts");
const { buildPublishPayload } = await import("../lib/report-snapshot.ts");
const { publishReport } = await import("../lib/reports-db.ts");

const args = process.argv.slice(2);
const doPublish = args.includes("--publish");
const artists = args.filter((a) => a !== "--publish");

if (artists.length === 0) {
  console.error('Usage: node scripts/batch_artist_audit.mjs [--publish] "Artist 1" "Artist 2" ...');
  process.exit(1);
}

const results = [];

for (const artistName of artists) {
  console.log(`\n=== ${artistName} ===`);
  const started = Date.now();
  try {
    const { rows, meta, summary } = await runArtistAudit({ artistName, scope: "top15" });
    const problems = rows.filter(
      (r) =>
        r.artisjusMatched ||
        r.mlcMatchStatus === "unmatched" ||
        r.mlcUnclaimed ||
        (r.cmoHits?.length ?? 0) > 0,
    );
    const summaryOut = {
      artist: artistName,
      elapsedSec: Math.round((Date.now() - started) / 1000),
      totalRows: rows.length,
      problemRows: problems.length,
      mlcUnmatched: meta.mlcUnmatchedCount,
      mlcUnclaimed: meta.mlcUnclaimedCount,
      artisjus: meta.artisjusCount,
      cmo: meta.cmoCounts ?? {},
      mlcScan: meta.mlcScanSource,
      mlcUnclaimedScan: meta.mlcUnclaimedScanSource,
      sampleProblems: problems.slice(0, 5).map((r) => ({
        title: r.title,
        isrc: r.isrc,
        unmatched: r.mlcMatchStatus === "unmatched",
        unclaimed: r.mlcUnclaimed,
        unclaimedPct: r.mlcUnclaimedPct,
        artisjus: r.artisjusMatched,
        cmo: (r.cmoHits ?? []).map((h) => h.source),
      })),
    };

    if (doPublish && problems.length > 0) {
      try {
        const payload = buildPublishPayload({
          artistName,
          scope: "top15",
          rows,
          summary,
          meta,
          problemsOnly: true,
        });
        const report = await publishReport(payload);
        const base =
          process.env.REPORT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3002";
        summaryOut.publishUrl = `${base}/r/${report.token}`;
        console.log("Published:", summaryOut.publishUrl);
      } catch (pubErr) {
        summaryOut.publishError = String(pubErr);
        console.error("Publish failed:", pubErr);
      }
    }

    results.push(summaryOut);
    console.log(JSON.stringify(summaryOut, null, 2));
  } catch (err) {
    console.error(`FAILED ${artistName}:`, err);
    results.push({ artist: artistName, error: String(err) });
  }
}

const outPath = path.join(projectRoot, "exports", "batch_audit_results.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ runAt: new Date().toISOString(), results }, null, 2));
console.log(`\nWrote ${outPath}`);
