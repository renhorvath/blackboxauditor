/** EJI / katalógus névváltozatok — nyugati vs. magyar sorrend + aliasok. */

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\w\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Bővíti a keresőneveket: aliasok + 2–3 tagú nevek sorrendcseréje
 * (Gergely Bogányi ↔ Bogányi Gergely).
 */
export function expandArtistNameVariants(
  primary: string,
  aliases: string[] = [],
): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, " ");
    if (t.length < 2) return;
    if (out.some((x) => fold(x) === fold(t))) return;
    out.push(t);
  };

  add(primary);
  for (const a of aliases) {
    for (const part of a.split(/[;|]/)) add(part);
  }

  for (const name of [...out]) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 2) {
      add(`${parts[1]} ${parts[0]}`);
    } else if (parts.length === 3) {
      // Vezetéknév elöl / hátul
      add(`${parts[2]} ${parts[0]} ${parts[1]}`);
      add(`${parts[1]} ${parts[2]} ${parts[0]}`);
      add(`${parts[2]} ${parts[1]} ${parts[0]}`);
    }
  }

  return out;
}
