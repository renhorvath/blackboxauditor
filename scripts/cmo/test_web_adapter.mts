#!/usr/bin/env npx tsx
/** Smoke test one CMO web adapter. Usage: test_web_adapter.mts <zaiks|sacem|...> [query] */
import { searchKoda } from "../../lib/cmo-web/adapters/koda.ts";
import { searchSacem } from "../../lib/cmo-web/adapters/sacem.ts";
import { searchSami } from "../../lib/cmo-web/adapters/sami.ts";
import { searchSpedidam } from "../../lib/cmo-web/adapters/spedidam.ts";
import { searchZaiks } from "../../lib/cmo-web/adapters/zaiks.ts";
import type { CmoWebSourceId } from "../../lib/cmo-web/web-types.ts";

const SEARCHERS = {
  zaiks: searchZaiks,
  sacem: searchSacem,
  spedidam: searchSpedidam,
  sami: searchSami,
  koda: searchKoda,
} as const;

const DEFAULT_QUERY: Partial<Record<keyof typeof SEARCHERS, string>> = {
  zaiks: "Chopin",
  sacem: "Gainsbourg",
  spedidam: "Piaf",
  sami: "Roxette",
  koda: "Aqua",
};

async function main() {
  const source = process.argv[2] as keyof typeof SEARCHERS | undefined;
  if (!source || !(source in SEARCHERS)) {
    console.error(`Usage: test_web_adapter.mts <${Object.keys(SEARCHERS).join("|")}> [query]`);
    process.exit(2);
  }
  const query = process.argv[3]?.trim() || DEFAULT_QUERY[source] || "test";
  const result = await SEARCHERS[source](query);
  const out = {
    source: result.source,
    query: result.query,
    hitCount: result.hits.length,
    error: result.error ?? null,
    sample: result.hits.slice(0, 2),
  };
  console.log(JSON.stringify(out, null, 2));
  if (result.error) process.exit(1);
  if (result.hits.length === 0) {
    console.error("WARN: zero hits — adapter may need fixing or query has no matches");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
