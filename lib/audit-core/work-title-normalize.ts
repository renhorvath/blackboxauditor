/** Work / recording title keys for parent-work bucketing (remix → parent ISWC / MLC match). */

export function normIswc(raw: string): string {
  return (raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function normTitle(raw: string): string {
  let t = (raw ?? "").toUpperCase();
  t = t.replace(/[^\w\s]/g, " ");
  t = t.replace(
    /\b(ORIGINAL MIX|RADIO EDIT|STREAMING CUT|EXTENDED MIX|CLUB MIX|INSTRUMENTAL|VOCAL REMIX|FEAT\.?|FT\.?|FEATURING|MIXED)\b/g,
    " ",
  );
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

/** Parent work title — strips remix/mix suffixes for ISWC / MLC title bucketing. */
export function baseWork(title: string): string {
  let t = (title ?? "").toUpperCase();
  t = t.replace(/\s*-\s*[^-]+REMIX.*$/i, "");
  t = t.replace(/\s*-\s*[^-]+MIX.*$/i, "");
  t = t.replace(/\s*\([^)]*REMIX[^)]*\).*$/i, "");
  t = t.replace(/\s*\([^)]*MIX[^)]*\).*$/i, "");
  return normTitle(t);
}

export function titleLookupKeys(title: string): string[] {
  const bkey = normTitle(title);
  const parent = baseWork(title);
  const pkey = parent || bkey;
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const key of [pkey, bkey]) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}
