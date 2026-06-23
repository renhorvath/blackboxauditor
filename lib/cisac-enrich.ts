import {
  cisacContributorLastName,
  cisacTitleKey,
  cisacTitleMatchScore,
} from "@/lib/audit-core/cisac-name-normalize";
import { baseWork } from "@/lib/audit-core/work-title-normalize";
import { lookupIswcNet } from "@/lib/iswc-net-index";
import {
  searchCisacByIpi,
  searchCisacByTitleAndContributor,
  type CisacWorkRecord,
} from "@/lib/cisac-iswc-api";
import type { AuditRow, BatchResult, SearchTrackHit } from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

const TITLE_MATCH_MIN_SCORE = 55;
const CISAC_DELAY_MS = 280;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeIsrcKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "");
}

function normalizeIpi(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.replace(/^0+/, "") || "0";
}

function rowTitle(row: AuditRow, spotifyByIsrc: Map<string, SearchTrackHit>): string | null {
  const key = normalizeIsrcKey(row.isrc ?? "");
  const spotify = key ? spotifyByIsrc.get(key) : undefined;
  return spotify?.title?.trim() || row.title?.trim() || null;
}

function rowTitleLookupKeys(row: AuditRow, spotifyByIsrc: Map<string, SearchTrackHit>): string[] {
  const title = rowTitle(row, spotifyByIsrc);
  if (!title) return [];
  const cleaned = title
    .replace(/\s*\(AZ\)\s*/gi, " ")
    .replace(/\s*\(HU\)\s*/gi, " ")
    .replace(/\s+ÓRIÁS\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const keys = [baseWork(title), baseWork(cleaned), title, cleaned];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const norm = cisacTitleKey(k);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push(k);
  }
  return out;
}

function findBestIswcForTitles(
  lookupTitles: string[],
  catalog: CisacWorkRecord[],
): string | null {
  let bestScore = 0;
  let bestIswc: string | null = null;
  for (const lookupTitle of lookupTitles) {
    for (const record of catalog) {
      const iswc = record.iswc?.trim();
      if (!iswc) continue;
      for (const catalogTitle of titlesFromCisacRecord(record)) {
        const score = cisacTitleMatchScore(catalogTitle, lookupTitle);
        if (score > bestScore && score >= TITLE_MATCH_MIN_SCORE) {
          bestScore = score;
          bestIswc = iswc;
        }
      }
    }
  }
  return bestIswc;
}

function titlesFromCisacRecord(record: CisacWorkRecord): string[] {
  const out: string[] = [];
  if (record.originalTitle?.trim()) out.push(record.originalTitle.trim());
  for (const alt of record.otherTitles ?? []) {
    if (typeof alt === "string" && alt.trim()) out.push(alt.trim());
    else if (alt && typeof alt === "object" && alt.title?.trim()) out.push(alt.title.trim());
  }
  return out;
}

function buildTitleIswcMap(records: CisacWorkRecord[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const record of records) {
    const iswc = record.iswc?.trim();
    if (!iswc) continue;
    for (const title of titlesFromCisacRecord(record)) {
      const key = cisacTitleKey(title);
      if (!key) continue;
      const existing = out.get(key);
      if (!existing || record.iswcStatus === "Preferred") {
        out.set(key, iswc);
      }
    }
  }
  return out;
}

function dominantIpiFromRows(rows: AuditRow[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const batch = row.rawBatchData as BatchResult | null | undefined;
    const songwriters = (batch?.data?.songwriters ?? []) as Array<{ ipi?: string | null }>;
    for (const sw of songwriters) {
      const ipi = normalizeIpi(sw.ipi);
      if (!ipi || ipi === "0") continue;
      counts.set(ipi, (counts.get(ipi) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [ipi, count] of counts) {
    if (count > bestCount) {
      best = ipi;
      bestCount = count;
    }
  }
  return bestCount >= 2 ? best : null;
}

function pickCisacRecordForTitle(
  records: CisacWorkRecord[],
  targetTitle: string,
): CisacWorkRecord | null {
  let best: CisacWorkRecord | null = null;
  let bestScore = 0;
  for (const record of records) {
    for (const title of titlesFromCisacRecord(record)) {
      const score = cisacTitleMatchScore(title, targetTitle);
      if (score > bestScore) {
        bestScore = score;
        best = record;
      }
    }
  }
  return bestScore >= TITLE_MATCH_MIN_SCORE ? best : null;
}

function applyCisacIswcToRow(row: AuditRow, iswc: string): AuditRow {
  const catalogEnrich = {
    ...row.catalogEnrich,
    enrichedAt: row.catalogEnrich?.enrichedAt ?? new Date().toISOString(),
    cisacFetched: true,
    cisacIswc: iswc,
  };
  const keptIssues = row.issues.filter((i) => i.type !== "no_iswc");
  return {
    ...row,
    iswc: row.iswc?.trim() || iswc,
    catalogEnrich,
    issues: keptIssues,
  };
}

export interface CisacEnrichResult {
  rows: AuditRow[];
  cisacCatalogWorks: number;
  cisacFilled: number;
  cisacTitleLookups: number;
  cisacIpiUsed: string | null;
  iswcNetFilled: number;
}

export async function applyIswcNetEnrichment(
  rows: AuditRow[],
  options: {
    artistSlug?: string | null;
    spotifyByIsrc?: Map<string, SearchTrackHit>;
  },
): Promise<{ rows: AuditRow[]; iswcNetFilled: number }> {
  const spotifyByIsrc = options.spotifyByIsrc ?? new Map<string, SearchTrackHit>();
  const artistSlug = options.artistSlug?.trim() || "";
  if (!artistSlug) return { rows, iswcNetFilled: 0 };

  let iswcNetFilled = 0;
  const out = rows.map((row) => {
    if (row.iswc?.trim()) return row;
    const title = rowTitle(row, spotifyByIsrc);
    if (!title) return row;
    const iswc = lookupIswcNet(title, artistSlug);
    if (!iswc) return row;
    iswcNetFilled += 1;
    return applyCisacIswcToRow(row, iswc);
  });
  return { rows: out, iswcNetFilled };
}

export async function applyCisacIswcEnrichment(
  rows: AuditRow[],
  options: {
    artistName?: string;
    legalName?: string | null;
    writerIpi?: string | null;
    artistSlug?: string | null;
    spotifyByIsrc?: Map<string, SearchTrackHit>;
    skipIswcNet?: boolean;
    skipCisacApi?: boolean;
  },
): Promise<CisacEnrichResult> {
  const spotifyByIsrc = options.spotifyByIsrc ?? new Map<string, SearchTrackHit>();
  const maxTitleLookups =
    Number.parseInt(process.env.CATALOG_ENRICH_CISAC_MAX ?? "60", 10) || 60;
  const delayMs =
    Number.parseInt(process.env.CISAC_ENRICH_DELAY_MS ?? String(CISAC_DELAY_MS), 10) ||
    CISAC_DELAY_MS;

  let out = rows;
  let cisacFilled = 0;
  let cisacTitleLookups = 0;
  let cisacCatalogWorks = 0;
  let cisacIpiUsed: string | null = normalizeIpi(options.writerIpi);
  let cisacCatalog: CisacWorkRecord[] = [];

  if (!options.skipCisacApi) {
    if (!cisacIpiUsed) {
      cisacIpiUsed = dominantIpiFromRows(rows);
    }

    const titleMap = new Map<string, string>();

    if (cisacIpiUsed) {
      try {
        const lastName = options.legalName
          ? cisacContributorLastName(options.legalName)
          : "";
        cisacCatalog = await searchCisacByIpi(cisacIpiUsed, lastName);
        cisacCatalogWorks = cisacCatalog.length;
        for (const [key, iswc] of buildTitleIswcMap(cisacCatalog)) {
          titleMap.set(key, iswc);
        }
      } catch (err) {
        console.warn("[catalog-enrich] CISAC IPI catalog failed:", err);
      }
    }

    if (titleMap.size > 0 || cisacCatalog.length > 0) {
      out = out.map((row) => {
        if (row.iswc?.trim()) return row;
        const lookupKeys = rowTitleLookupKeys(row, spotifyByIsrc);
        for (const lookupTitle of lookupKeys) {
          const iswc = titleMap.get(cisacTitleKey(lookupTitle));
          if (iswc) {
            cisacFilled += 1;
            return applyCisacIswcToRow(row, iswc);
          }
        }
        if (cisacCatalog.length > 0) {
          const fuzzy = findBestIswcForTitles(lookupKeys, cisacCatalog);
          if (fuzzy) {
            cisacFilled += 1;
            return applyCisacIswcToRow(row, fuzzy);
          }
        }
        return row;
      });
    }

    const legalName = options.legalName?.trim();
    const lastName = legalName ? cisacContributorLastName(legalName) : "";
    const hasRealIsrcRows = rows.some(
      (row) => row.isrc?.trim() && !isSyntheticAuditIsrc(row.isrc),
    );
    const composerOnlyRows = !hasRealIsrcRows;
    let effectiveMaxTitleLookups = maxTitleLookups;
    if (composerOnlyRows) {
      effectiveMaxTitleLookups = Math.min(maxTitleLookups, 8);
    } else if (hasRealIsrcRows) {
      effectiveMaxTitleLookups = Math.min(maxTitleLookups, 20);
    }
    if (cisacCatalogWorks >= 20 && cisacFilled === 0) {
      effectiveMaxTitleLookups = 0;
    }

    if (lastName && effectiveMaxTitleLookups > 0 && cisacTitleLookups < effectiveMaxTitleLookups) {
      const candidates = out.filter((row) => {
        if (row.iswc?.trim()) return false;
        const isrc = row.isrc?.trim();
        if (hasRealIsrcRows && isrc && isSyntheticAuditIsrc(isrc)) return false;
        return Boolean(rowTitle(row, spotifyByIsrc));
      });

      for (const row of candidates) {
        if (cisacTitleLookups >= effectiveMaxTitleLookups) break;
        const title = rowTitle(row, spotifyByIsrc);
        if (!title) continue;
        cisacTitleLookups += 1;
        try {
          const hits = await searchCisacByTitleAndContributor(title, lastName);
          const picked = pickCisacRecordForTitle(hits, title);
          if (picked?.iswc?.trim()) {
            cisacFilled += 1;
            const iswc = picked.iswc.trim();
            out = out.map((r) =>
              normalizeIsrcKey(r.isrc ?? "") === normalizeIsrcKey(row.isrc ?? "")
                ? applyCisacIswcToRow(r, iswc)
                : r,
            );
          }
        } catch {
          /* title search often 500 — skip */
        }
        await delay(delayMs);
      }
    }
  }

  let iswcNetFilled = 0;
  if (!options.skipIswcNet) {
    const net = await applyIswcNetEnrichment(out, {
      artistSlug: options.artistSlug,
      spotifyByIsrc,
    });
    out = net.rows;
    iswcNetFilled = net.iswcNetFilled;
  }

  return {
    rows: out,
    cisacCatalogWorks,
    cisacFilled,
    cisacTitleLookups,
    cisacIpiUsed,
    iswcNetFilled,
  };
}
