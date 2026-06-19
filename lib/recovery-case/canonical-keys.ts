import type { CanonicalFacts, CanonicalKey } from "@/lib/recovery-case/types";

/** Playbook ID → kötelező canonical mezők (adapter / pre-fill). */
export const PLAYBOOK_REQUIRED_KEYS: Record<string, CanonicalKey[]> = {
  "hu.eji.unidentified": ["title", "mainArtist", "isrc", "releaseYear", "label"],
  "hu.artisjus.unidentified_work": ["title", "writers"],
  "de.gvl.konu": ["isrc", "produktionsnummer", "mainArtist"],
  "de.gvl.sendemeldung": ["isrc", "produktionsnummer", "mainArtist"],
  "de.gvl.listen_artist": ["isrc", "mainArtist"],
  "de.gvl.listen_producer": ["isrc", "mainArtist"],
  "us.mlc.unmatched_recording": ["isrc", "title"],
  "us.mlc.unclaimed_share": ["isrc", "mlcSongCode"],
};

export function requiredKeysForPlaybook(playbookId: string): CanonicalKey[] {
  if (PLAYBOOK_REQUIRED_KEYS[playbookId]?.length) {
    return PLAYBOOK_REQUIRED_KEYS[playbookId];
  }
  return [];
}

export function canonicalKeyFilled(facts: CanonicalFacts, key: CanonicalKey): boolean {
  const v = facts[key];
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  return Boolean(v);
}

export function auditCanonicalKeys(facts: CanonicalFacts, required: CanonicalKey[]): {
  filledFields: CanonicalKey[];
  missingFields: CanonicalKey[];
} {
  const filledFields: CanonicalKey[] = [];
  const missingFields: CanonicalKey[] = [];
  for (const key of required) {
    if (canonicalKeyFilled(facts, key)) filledFields.push(key);
    else missingFields.push(key);
  }
  return { filledFields, missingFields };
}
