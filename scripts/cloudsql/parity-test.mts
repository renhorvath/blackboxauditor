#!/usr/bin/env npx tsx
/**
 * Compare local file index search vs Cloud SQL search for sample artists.
 */
import { loadDotenvLocal } from "../../lib/load-dotenv-local";
import { searchArtisjusByArtist } from "../../lib/artisjus-index";
import { searchCmoByArtist } from "../../lib/cmo-index";
import {
  searchArtisjusByArtistDb,
  searchCmoByArtistDb,
} from "../../lib/index-search-db";

loadDotenvLocal();

const NAMES = [
  "Jazzbois",
  "Tomi Malm",
  "Bea Palya",
  "Quimby",
  "Tankcsapda",
  "Kowalsky",
  "Ivan & The Parazol",
  "Heaven Street Seven",
];

function topKeysArtisjus(hits: { work: { mukod: string }; score: number }[], n = 10): string[] {
  return hits.slice(0, n).map((h) => `${h.work.mukod}:${h.score.toFixed(3)}`);
}

function topKeysCmo(hits: { record: { source: string; id: string }; score: number }[], n = 10): string[] {
  return hits.slice(0, n).map((h) => `${h.record.source}:${h.record.id}:${h.score.toFixed(3)}`);
}

function overlap(a: string[], b: string[]): number {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x)).length;
}

async function main() {
  let failures = 0;
  console.log("Warmup…");
  await searchArtisjusByArtistDb("Jazzbois", 10);
  await searchCmoByArtistDb("Jazzbois", { limit: 10 });

  for (const name of NAMES) {
    const t0 = Date.now();
    const [ajFile, ajDb, cmoFile, cmoDb] = await Promise.all([
      Promise.resolve(searchArtisjusByArtist(name, 150)),
      searchArtisjusByArtistDb(name, 150),
      Promise.resolve(searchCmoByArtist(name, { limit: 120 })),
      searchCmoByArtistDb(name, { limit: 120 }),
    ]);
    const elapsed = Date.now() - t0;

    // Timed DB-only pass (file already warm in memory)
    const tDb0 = Date.now();
    await Promise.all([
      searchArtisjusByArtistDb(name, 150),
      searchCmoByArtistDb(name, { limit: 120 }),
    ]);
    const dbMs = Date.now() - tDb0;

    const ajA = topKeysArtisjus(ajFile);
    const ajB = topKeysArtisjus(ajDb);
    const cmoA = topKeysCmo(cmoFile);
    const cmoB = topKeysCmo(cmoDb);

    const ajOverlap = overlap(ajA, ajB);
    const cmoOverlap = overlap(cmoA, cmoB);
    const ajOk =
      ajFile.length === 0 && ajDb.length === 0
        ? true
        : ajOverlap >= Math.min(5, ajA.length) || (ajA.length > 0 && ajA[0] === ajB[0]);
    const cmoOk =
      cmoFile.length === 0 && cmoDb.length === 0
        ? true
        : cmoOverlap >= Math.min(5, cmoA.length) || (cmoA.length > 0 && cmoA[0] === cmoB[0]);

    // Also require count parity within tolerance (no silent data loss)
    const ajCountOk = Math.abs(ajFile.length - ajDb.length) <= Math.max(1, Math.floor(ajFile.length * 0.05));
    const cmoCountOk =
      Math.abs(cmoFile.length - cmoDb.length) <= Math.max(2, Math.floor(cmoFile.length * 0.1));

    const status = ajOk && cmoOk && ajCountOk && cmoCountOk ? "OK" : "DIFF";
    if (status === "DIFF") failures += 1;

    console.log(
      `${status}  ${name.padEnd(24)} artisjus file=${ajFile.length} db=${ajDb.length} top=${ajOverlap}/10  |  cmo file=${cmoFile.length} db=${cmoDb.length} top=${cmoOverlap}/10  |  dbOnly=${dbMs}ms (pair=${elapsed}ms)`,
    );
    if (status === "DIFF") {
      console.log(`       artisjus file: ${ajA.slice(0, 3).join(", ")}`);
      console.log(`       artisjus db:   ${ajB.slice(0, 3).join(", ")}`);
      console.log(`       cmo file: ${cmoA.slice(0, 3).join(", ")}`);
      console.log(`       cmo db:   ${cmoB.slice(0, 3).join(", ")}`);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} artist(s) differed`);
    process.exit(1);
  }
  console.log("\nAll sample artists match closely enough.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
