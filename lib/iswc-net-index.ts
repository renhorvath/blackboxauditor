import fs from "node:fs";

import { baseWork, normIswc, normTitle } from "@/lib/audit-core/work-title-normalize";
import { resolveArtistCatalogFiles } from "@/lib/artist-data-paths";

type IswcNetEntry = [string, string];

const cacheBySlug = new Map<string, Map<string, string>>();

export function loadIswcNetByTitle(slug: string | null | undefined): Map<string, string> {
  const key = slug?.trim() || "";
  if (!key) return new Map();

  const cached = cacheBySlug.get(key);
  if (cached) return cached;

  const out = new Map<string, string>();
  const file = resolveArtistCatalogFiles(key).iswcNetJson;
  if (!file) {
    cacheBySlug.set(key, out);
    return out;
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as IswcNetEntry[];
  for (const [iswc, title] of parsed) {
    const titleKey = normTitle(title);
    if (!titleKey) continue;
    out.set(titleKey, normIswc(iswc));
  }

  cacheBySlug.set(key, out);
  return out;
}

export function lookupIswcNet(
  title: string | null | undefined,
  slug: string | null | undefined,
): string | null {
  if (!title?.trim() || !slug?.trim()) return null;
  const map = loadIswcNetByTitle(slug);
  if (map.size === 0) return null;

  for (const key of [baseWork(title), normTitle(title)]) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  return null;
}
