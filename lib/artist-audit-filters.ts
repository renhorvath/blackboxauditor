import {
  artistNameMatchStrength,
  splitArtistNameSegments,
  type ArtistNameMatchStrength,
} from "@/lib/artist-name-match";
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import type { CmoSourceId } from "@/lib/cmo-types";
import type { AuditRow } from "@/lib/types";

export type AuditSourceFilterId =
  | "artisjus"
  | "eji"
  | "mlc-unmatched"
  | "mlc-unclaimed"
  | CmoSourceId;

export const ALL_SOURCE_FILTER_IDS: AuditSourceFilterId[] = [
  "artisjus",
  "eji",
  "mlc-unmatched",
  "mlc-unclaimed",
  "at-akm",
  "at-aume",
  "nl-sena",
];

export const SOURCE_FILTER_LABELS: Record<AuditSourceFilterId, string> = {
  artisjus: "ARTISJUS",
  eji: "EJI",
  "mlc-unmatched": "MLC streaming",
  "mlc-unclaimed": "MLC mechanikai",
  "at-akm": "AKM",
  "at-aume": "AUME",
  "nl-sena": "SENA",
};

const STRENGTH_ORDER: Record<ArtistNameMatchStrength, number> = {
  exact: 0,
  word: 1,
  substring: 2,
  none: 3,
};

const STRENGTH_LABEL: Record<Exclude<ArtistNameMatchStrength, "none">, string> = {
  exact: "pontos",
  word: "szóegyezés",
  substring: "hasonló név",
};

function normKey(value: string): string {
  return normalizeArtisjusText(value).replace(/\s+/g, " ").trim();
}

export interface NameVariantOption {
  key: string;
  display: string;
  count: number;
  strength: Exclude<ArtistNameMatchStrength, "none">;
}

export const ALL_NAME_VARIANTS = "__all__";

export function collectNameVariants(query: string, rows: AuditRow[]): NameVariantOption[] {
  const map = new Map<
    string,
    { display: string; count: number; strength: Exclude<ArtistNameMatchStrength, "none"> }
  >();

  const add = (raw: string) => {
    const display = raw.trim();
    if (!display) return;
    const strength = artistNameMatchStrength(query, display);
    if (strength === "none") return;
    const key = normKey(display);
    if (!key) return;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { display, count: 1, strength });
      return;
    }
    existing.count += 1;
    if (STRENGTH_ORDER[strength] < STRENGTH_ORDER[existing.strength]) {
      existing.strength = strength;
      existing.display = display;
    }
  };

  for (const row of rows) {
    const artist = row.artist?.trim();
    if (!artist) continue;
    add(artist);
    for (const seg of splitArtistNameSegments(artist)) {
      add(seg);
    }
    for (const hit of row.ejiHits ?? []) {
      if (hit.mainArtist) add(hit.mainArtist);
      if (hit.name) add(hit.name);
    }
  }

  return [...map.values()]
    .map((v) => ({
      key: normKey(v.display),
      display: v.display,
      count: v.count,
      strength: v.strength,
    }))
    .sort((a, b) => {
      const sa = STRENGTH_ORDER[a.strength];
      const sb = STRENGTH_ORDER[b.strength];
      if (sa !== sb) return sa - sb;
      return b.count - a.count || a.display.localeCompare(b.display, "hu", { sensitivity: "base" });
    });
}

export function nameVariantLabel(option: NameVariantOption): string {
  return `${option.display} (${option.count}) · ${STRENGTH_LABEL[option.strength]}`;
}

export function rowMatchesNameVariant(
  row: AuditRow,
  variantKey: string,
): boolean {
  if (variantKey === ALL_NAME_VARIANTS) return true;

  const candidates: string[] = [];
  if (row.artist?.trim()) {
    candidates.push(row.artist.trim());
    candidates.push(...splitArtistNameSegments(row.artist));
  }
  for (const hit of row.ejiHits ?? []) {
    if (hit.mainArtist?.trim()) candidates.push(hit.mainArtist.trim());
    if (hit.name?.trim()) candidates.push(hit.name.trim());
  }

  return candidates.some((c) => normKey(c) === variantKey);
}

export function getRowSourceIds(row: AuditRow): AuditSourceFilterId[] {
  const ids: AuditSourceFilterId[] = [];
  if (row.artisjusMatched) ids.push("artisjus");
  if (row.ejiHits && row.ejiHits.length > 0) ids.push("eji");
  if (row.mlcMatchStatus === "unmatched") ids.push("mlc-unmatched");
  if (row.mlcUnclaimed) ids.push("mlc-unclaimed");
  for (const hit of row.cmoHits ?? []) {
    if (!ids.includes(hit.source)) ids.push(hit.source);
  }
  return ids;
}

export function rowMatchesSourceFilters(
  row: AuditRow,
  enabled: ReadonlySet<AuditSourceFilterId>,
): boolean {
  if (enabled.size === 0) return false;
  const rowSources = getRowSourceIds(row);
  if (rowSources.length === 0) {
    return enabled.size === ALL_SOURCE_FILTER_IDS.length;
  }
  return rowSources.some((id) => enabled.has(id));
}

export function sourceFilterCount(
  rows: AuditRow[],
  id: AuditSourceFilterId,
): number {
  return rows.filter((row) => getRowSourceIds(row).includes(id)).length;
}
