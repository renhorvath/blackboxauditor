#!/usr/bin/env npx tsx
/**
 * Run artist audit and export RecoveryCase bundle to data/artists/{slug}/cases.json
 *
 * Usage:
 *   npm run recovery:export-cases -- "Moldvai Márk"
 *   npm run recovery:export-cases -- "Moldvai Márk" --scope full
 *   npm run recovery:export-cases -- --from-json exports/batch_audit_results.json "Moldvai Márk"
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");

const { loadDotenvLocal } = await import("../../lib/load-dotenv-local");
loadDotenvLocal(projectRoot);

const args = process.argv.slice(2);
const fromJsonIdx = args.indexOf("--from-json");
let fromJsonPath: string | null = null;
if (fromJsonIdx >= 0) {
  fromJsonPath = args[fromJsonIdx + 1] ?? null;
  args.splice(fromJsonIdx, 2);
}
const scope = args.includes("--scope") && args[args.indexOf("--scope") + 1] === "full" ? "full" : "top15";
const filteredArgs = args.filter((a, i) => a !== "--scope" && args[i - 1] !== "--scope");
const artistName = filteredArgs.join(" ").trim();

if (!artistName) {
  console.error(
    "Usage: npm run recovery:export-cases -- \"Artist Name\" [--scope full] [--from-json path.json]",
  );
  process.exit(1);
}

const { buildRecoveryCases } = await import("../../lib/recovery-case/build-cases");
const { artistSlug } = await import("../../lib/recovery-case/artist-slug");

type AuditPayload = { rows: import("../../lib/types").AuditRow[] };

async function loadRows(): Promise<import("../../lib/types").AuditRow[]> {
  if (fromJsonPath) {
    const abs = path.isAbsolute(fromJsonPath) ? fromJsonPath : path.join(projectRoot, fromJsonPath);
    const raw = JSON.parse(fs.readFileSync(abs, "utf-8")) as
      | AuditPayload
      | { results?: Array<{ artist: string; rows?: AuditPayload["rows"] }> };
    if ("results" in raw && Array.isArray(raw.results)) {
      const hit = raw.results.find((r) => r.artist === artistName);
      if (!hit?.rows) throw new Error(`No rows for "${artistName}" in ${fromJsonPath}`);
      return hit.rows;
    }
    if ("rows" in raw && Array.isArray(raw.rows)) return raw.rows;
    throw new Error(`Unrecognized JSON shape: ${fromJsonPath}`);
  }

  const { runArtistAudit } = await import("../../lib/artist-audit");
  console.log(`Running artist audit (${scope}) for: ${artistName}`);
  const started = Date.now();
  const { rows } = await runArtistAudit({ artistName, scope });
  console.log(`Audit done in ${Math.round((Date.now() - started) / 1000)}s — ${rows.length} rows`);
  return rows;
}

const rows = await loadRows();
const bundle = buildRecoveryCases({ artistDisplayName: artistName, rows });
const slug = artistSlug(artistName);
const outDir = path.join(projectRoot, "data", "artists", slug);
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "cases.json");
fs.writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf-8");

console.log(`\nWrote ${bundle.caseCount} recovery case(s) → ${outPath}`);

const byStatus = { ready: 0, partial: 0, blocked: 0 };
for (const c of bundle.cases) {
  for (const t of c.recoveryTargets) {
    byStatus[t.status] += 1;
  }
}
console.log("Recovery targets:", byStatus);

const sample = bundle.cases[0];
if (sample) {
  console.log("\nSample case:", sample.caseId);
  console.log("  Blackbox hits:", sample.blackboxHits.map((h) => h.playbookId).join(", "));
  console.log(
    "  Targets:",
    sample.recoveryTargets
      .map((t) => `${t.playbookId} [${t.status}] missing=${t.missingFields.join(",") || "—"}`)
      .join("\n         "),
  );
}
