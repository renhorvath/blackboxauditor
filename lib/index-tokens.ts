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

export function artistMatchThreshold(tokenCount: number): number {
  if (tokenCount >= 2) return 0.55;
  if (tokenCount === 1) return 0.75;
  return 0.6;
}
