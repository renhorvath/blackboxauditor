#!/usr/bin/env npx tsx
/**
 * EJI jogosultkutatás — CLI prototípus.
 * Usage: npm run eji:search -- "Quimby"
 */
import { searchEjiByArtist } from "../../lib/cmo-web/eji-search";

const query = process.argv.slice(2).filter((a) => a !== "--refresh").join(" ").trim();
if (query.length < 2) {
  console.error("Usage: npm run eji:search -- <artist name> [--refresh]");
  process.exit(1);
}

const result = await searchEjiByArtist(query, {
  forceRefresh: process.argv.includes("--refresh"),
});

console.log(JSON.stringify(result, null, 2));
console.error(
  `\n${result.trackHits.length} track + ${result.artistHits.length} artist hit (${result.fromCache ? "cache" : "live"})`,
);
