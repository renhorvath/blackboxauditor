#!/usr/bin/env npx tsx
/** List published reports; optionally match pitch-packet artist names. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listReports } from "../../lib/reports-db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

function loadEnvLocal() {
  const envPath = path.join(projectRoot, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const eq = t.indexOf("=");
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
}

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const PITCH_PACKET = [
  "Moldvai Márk",
  "Wettl Mátyás",
  "Mészáros János",
  "Melis László",
  "Barabás Béla",
  "Björkvall Oliver",
  "Czeichner Tamás",
  "Madarász Gábor",
  "Presser Gábor",
  "Balázs Ádám",
];

loadEnvLocal();

const reports = await listReports();
const base = (process.env.REPORT_PUBLIC_BASE_URL || "http://localhost:3002").replace(/\/$/, "");

const byNorm = new Map<string, typeof reports>();
for (const r of reports) {
  const n = norm(r.artistDisplayName);
  if (!byNorm.has(n)) byNorm.set(n, []);
  byNorm.get(n)!.push(r);
}

console.log(`Published reports in DB (max 200): ${reports.length}\n`);
console.log("=== Pitch packet (top 10) ===\n");

for (const display of PITCH_PACKET) {
  const hits = byNorm.get(norm(display)) ?? [];
  if (!hits.length) {
    console.log(`❌ ${display}`);
    continue;
  }
  for (const r of hits) {
    const revoked = r.revokedAt ? " [REVOKED]" : "";
    console.log(`✅ ${display}${revoked}`);
    console.log(`   ${r.publishedAt.slice(0, 10)} | ${r.findingCount} findings | ${base}/r/${r.token}`);
  }
}

console.log("\n=== All unique artists (published) ===\n");
const unique = [...new Set(reports.map((r) => r.artistDisplayName))].sort((a, b) =>
  a.localeCompare(b, "hu"),
);
for (const name of unique) console.log(` • ${name}`);
