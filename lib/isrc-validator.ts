const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{2}[0-9]{5}$/;

export function validateIsrc(raw: string): { valid: boolean; normalized: string } {
  const normalized = raw.trim().toUpperCase().replace(/-/g, "");
  return {
    valid: ISRC_REGEX.test(normalized),
    normalized,
  };
}

export function parseIsrcInput(raw: string): {
  valid: string[];
  invalid: string[];
} {
  const lines = raw
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const line of lines) {
    const { valid: isValid, normalized } = validateIsrc(line);
    if (isValid) valid.push(normalized);
    else invalid.push(line);
  }

  return { valid: [...new Set(valid)], invalid };
}
