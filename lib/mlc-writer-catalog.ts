/** MLC writer works catalog — per-artist title index + optional song-code prefetch. */

import fs from "node:fs";

import { normTitle, titleLookupKeys } from "@/lib/audit-core/work-title-normalize";
import { resolveArtistCatalogFiles } from "@/lib/artist-data-paths";
import {
  fetchMlcWorksBySongCodes,
  mlcWorksApiAvailable,
  type MlcWorkRecord,
} from "@/lib/mlc-works-api";

export interface MlcCatalogEntry {
  code: string;
  title: string;
  share: number;
  iswc: string;
}

export interface MlcTitleCatalog {
  byNorm: Map<string, MlcCatalogEntry[]>;
  byCode: Map<string, MlcCatalogEntry>;
  source: "csv" | "api" | "none";
  workCount: number;
}

const cacheBySlug = new Map<string, MlcTitleCatalog>();

function parseShare(raw: string | undefined): number {
  const n = Number.parseFloat(raw ?? "");
  return Number.isFinite(n) ? n : 0;
}

function buildIndexFromEntries(entries: MlcCatalogEntry[]): MlcTitleCatalog {
  const byNorm = new Map<string, MlcCatalogEntry[]>();
  const byCode = new Map<string, MlcCatalogEntry>();

  const add = (key: string, entry: MlcCatalogEntry) => {
    const list = byNorm.get(key) ?? [];
    if (!list.some((e) => e.code === entry.code)) list.push(entry);
    byNorm.set(key, list);
  };

  for (const entry of entries) {
    byCode.set(entry.code.toUpperCase(), entry);
    add(normTitle(entry.title), entry);
  }

  return { byNorm, byCode, source: "none", workCount: entries.length };
}

function loadMlcCatalogFromCsv(filePath: string): MlcTitleCatalog | null {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;

  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);

  const entries: MlcCatalogEntry[] = [];
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const code = cols[idx("mlc_song_code")]?.trim().toUpperCase();
    const title = cols[idx("title")]?.trim();
    if (!code || !title) continue;
    entries.push({
      code,
      title,
      share: parseShare(cols[idx("known_shares_pct")]),
      iswc: (cols[idx("iswc")] ?? "").trim(),
    });
  }

  if (entries.length === 0) return null;
  const catalog = buildIndexFromEntries(entries);
  return { ...catalog, source: "csv" };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function loadSongCodesJson(filePath: string): string[] {
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((code) => String(code ?? "").trim().toUpperCase())
    .filter(Boolean);
}

function mapWorkToEntry(work: MlcWorkRecord): MlcCatalogEntry {
  return {
    code: work.mlcSongCode,
    title: work.primaryTitle,
    share: work.knownSharesPct,
    iswc: work.iswc ?? "",
  };
}

const emptyCatalog = (): MlcTitleCatalog => ({
  byNorm: new Map(),
  byCode: new Map(),
  source: "none",
  workCount: 0,
});

export async function loadMlcWriterTitleCatalog(
  slug: string | null | undefined,
): Promise<MlcTitleCatalog> {
  const key = slug?.trim() || "";
  if (!key) return emptyCatalog();

  const cached = cacheBySlug.get(key);
  if (cached) return cached;

  const files = resolveArtistCatalogFiles(key);

  if (files.mlcWorksCsv) {
    const fromCsv = loadMlcCatalogFromCsv(files.mlcWorksCsv);
    if (fromCsv) {
      cacheBySlug.set(key, fromCsv);
      return fromCsv;
    }
  }

  if (!files.mlcSongCodesJson || !mlcWorksApiAvailable()) {
    const none = emptyCatalog();
    cacheBySlug.set(key, none);
    return none;
  }

  try {
    const codes = loadSongCodesJson(files.mlcSongCodesJson);
    if (codes.length === 0) {
      const none = emptyCatalog();
      cacheBySlug.set(key, none);
      return none;
    }
    const works = await fetchMlcWorksBySongCodes(codes);
    const entries = [...works.values()].map(mapWorkToEntry);
    const catalog = { ...buildIndexFromEntries(entries), source: "api" as const };
    cacheBySlug.set(key, catalog);
    return catalog;
  } catch (err) {
    console.warn(`[catalog-enrich] MLC writer catalog prefetch failed (${key}):`, err);
    const none = emptyCatalog();
    cacheBySlug.set(key, none);
    return none;
  }
}

export function pickMlcTitleMatches(
  title: string,
  parent: string,
  byNorm: Map<string, MlcCatalogEntry[]>,
): MlcCatalogEntry[] {
  const keys = titleLookupKeys(title);
  if (parent && !keys.includes(parent)) keys.push(parent);

  const seenKeys = new Set<string>();
  const matches: MlcCatalogEntry[] = [];
  const seenCodes = new Set<string>();

  const append = (items: MlcCatalogEntry[]) => {
    for (const m of items) {
      const code = m.code.toUpperCase();
      if (seenCodes.has(code)) continue;
      seenCodes.add(code);
      matches.push(m);
    }
  };

  for (const lookupKey of keys) {
    if (!lookupKey || seenKeys.has(lookupKey)) continue;
    seenKeys.add(lookupKey);
    append(byNorm.get(lookupKey) ?? []);
  }
  if (matches.length > 0) return matches;

  for (const [indexKey, items] of byNorm) {
    for (const k of keys) {
      if (!k || k.length < 6) continue;
      if (indexKey.includes(k) || k.includes(indexKey)) {
        append(items);
      }
    }
  }

  return matches;
}

export function pickBestMlcCatalogEntry(matches: MlcCatalogEntry[]): MlcCatalogEntry | undefined {
  if (matches.length === 0) return undefined;
  return [...matches].sort((a, b) => b.share - a.share)[0];
}

export function catalogEntryToWork(entry: MlcCatalogEntry): MlcWorkRecord {
  return {
    mlcSongCode: entry.code,
    primaryTitle: entry.title,
    iswc: entry.iswc.trim() || null,
    writers: [],
    publishers: [],
    knownSharesPct: entry.share,
  };
}
