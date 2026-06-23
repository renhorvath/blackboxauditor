/** CISAC ISWCnet contributor / title normalization (see docs/cisac_probe_findings.md). */

export function cisacNormalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function cisacTitleKey(raw: string): string {
  return cisacNormalizeText(raw).replace(/[^A-Z0-9]+/g, " ").trim();
}

/** Vezetéknév a legal name-ből — HU: első token (Topa Ferenc → TOPA); nyugati: utolsó (Adam Balazs → BALAZS). */
export function cisacContributorLastName(legalName: string): string {
  const parts = legalName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return cisacNormalizeText(parts[0]);
  const hasHuDiacritics = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(legalName);
  if (!hasHuDiacritics) {
    return cisacNormalizeText(parts[parts.length - 1]);
  }
  return cisacNormalizeText(parts[0]);
}

export function cisacTitleMatchScore(a: string, b: string): number {
  const na = cisacTitleKey(a);
  const nb = cisacTitleKey(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 80;
  const aWords = na.split(" ").filter((w) => w.length > 2);
  const bWords = new Set(nb.split(" ").filter((w) => w.length > 2));
  const overlap = aWords.filter((w) => bWords.has(w)).length;
  if (overlap >= 2) return 50 + overlap * 5;
  return 0;
}
