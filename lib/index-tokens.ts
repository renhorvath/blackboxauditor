/** Shared tokenisation for ARTISJUS / CMO indexes (file + Cloud SQL). */
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";

const STOP = new Set([
  "the", "and", "feat", "ft", "featuring", "a", "an", "az", "egy", "es", "is",
  "of", "in", "on", "de", "la", "le", "les", "el", "y", "vs", "mix", "remix",
]);

export function indexTokens(value: string | null | undefined, minLen = 2): string[] {
  return normalizeArtisjusText(value)
    .split(" ")
    .filter((t) => t.length >= minLen && !STOP.has(t));
}

export function uniqueTokens(value: string | null | undefined, minLen = 2): string[] {
  return [...new Set(indexTokens(value, minLen))];
}

export function artisjusSearchBlob(work: {
  mucim: string;
  eloadok: string;
  jogosultak: string;
}): string {
  return `${work.mucim} ${work.eloadok} ${work.jogosultak}`;
}

export function cmoSearchBlob(record: {
  title: string;
  identification: string;
  performer?: string | null;
  composer?: string | null;
  label?: string | null;
  gvlRemix?: string | null;
}): string {
  return [
    record.title,
    record.identification,
    record.performer ?? "",
    record.composer ?? "",
    record.label ?? "",
    record.gvlRemix ?? "",
  ].join(" ");
}

/**
 * Artist-name matching blob: performer/composer only.
 * Avoids false hits from titles ("Animanimals (Elefant)") and labels ("Elefant Records").
 * Falls back to identification when both artist fields are empty (some CMO rows only have that).
 */
export function cmoArtistScoreBlob(record: {
  identification: string;
  performer?: string | null;
  composer?: string | null;
}): string {
  const artistFields = [record.performer, record.composer]
    .map((v) => (v ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (artistFields) return artistFields;
  return record.identification ?? "";
}

/** Band/legal suffixes stripped before comparing name token sets. */
const ARTIST_AFFIXES = new Set([
  "zenekar",
  "band",
  "orchestra",
  "ensemble",
  "group",
  "trio",
  "quartet",
  "kvartett",
  "kvintett",
  "quintet",
  "choir",
  "chorus",
  "project",
  "projekt",
  "dj",
  "the",
]);

function artistNameTokens(value: string): string[] {
  return [...new Set(indexTokens(value, 2).filter((t) => !ARTIST_AFFIXES.has(t)))];
}

/**
 * Score how closely an artist field matches the query tokens.
 * Requires every query token to appear, then penalizes extra name tokens
 * ("Molnár Elefánt György", "Omega Elefánt Band" vs query "Elefánt").
 */
export function scoreArtistNameMatch(
  field: string | null | undefined,
  queryTokens: string[],
): number {
  if (queryTokens.length === 0 || !field?.trim()) return 0;

  const segments = field
    .split(/[/;·|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const parts = segments.length > 0 ? segments : [field];

  let best = 0;
  for (const part of parts) {
    const fieldToks = artistNameTokens(part);
    if (fieldToks.length === 0) continue;
    const hits = queryTokens.filter((t) => fieldToks.includes(t)).length;
    // All query tokens must be present (no "Heaven"-only hit for "Heaven Street Seven")
    if (hits < queryTokens.length) continue;
    best = Math.max(best, queryTokens.length / fieldToks.length);
  }
  return best;
}

/** CMO artist score: max over performer / composer (or identification fallback). */
export function scoreCmoArtistRecord(
  record: {
    identification: string;
    performer?: string | null;
    composer?: string | null;
  },
  queryTokens: string[],
): number {
  const fields = [record.performer, record.composer]
    .map((v) => (v ?? "").trim())
    .filter(Boolean);
  if (fields.length === 0 && record.identification?.trim()) {
    fields.push(record.identification);
  }
  let best = 0;
  for (const field of fields) {
    best = Math.max(best, scoreArtistNameMatch(field, queryTokens));
  }
  return best;
}

export function artistMatchThreshold(tokenCount: number): number {
  if (tokenCount >= 2) return 0.55;
  if (tokenCount === 1) return 0.75;
  return 0.6;
}
