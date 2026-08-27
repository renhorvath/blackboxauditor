#!/usr/bin/env npx tsx
/** Apply Neon schema — run locally or in CI with DATABASE_URL set. */
import { ensureSchema, dbConfigured } from "../../lib/db";
import { ensureLandingSearchSchema } from "../../lib/landing-search-db";
import { loadDotenvLocal } from "../../lib/load-dotenv-local";

loadDotenvLocal();

async function main() {
  if (!dbConfigured()) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  await ensureSchema();
  await ensureLandingSearchSchema();
  console.log("Schema applied (reports, case_findings, landing_searches, landing_search_cache)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
