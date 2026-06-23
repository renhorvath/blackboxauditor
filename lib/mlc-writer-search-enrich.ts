import { baseWork, titleLookupKeys } from "@/lib/audit-core/work-title-normalize";
import {
  pickBestMlcWorkSearchHit,
  searchMlcWriterWorksForTitles,
  mlcWorksApiAvailable,
  type MlcWorkSearchHit,
} from "@/lib/mlc-works-api";
import type { AuditRow, SearchTrackHit } from "@/lib/types";

function rowTitles(row: AuditRow, spotifyByIsrc: Map<string, SearchTrackHit>): string[] {
  const key = (row.isrc ?? "").trim().toUpperCase().replace(/-/g, "");
  const spotify = key ? spotifyByIsrc.get(key) : undefined;
  const titles = new Set<string>();
  for (const t of [spotify?.title, row.title]) {
    const trimmed = t?.trim();
    if (trimmed) titles.add(trimmed);
  }
  const parent = baseWork(spotify?.title ?? row.title ?? "");
  if (parent) titles.add(parent);
  for (const k of titleLookupKeys(spotify?.title ?? row.title ?? "")) {
    if (k) titles.add(k);
  }
  return [...titles];
}

function applyMlcWorkHitToRow(row: AuditRow, hit: MlcWorkSearchHit): AuditRow {
  const mlcWriters = hit.writers
    .map((w) => {
      const name = `${w.writerFirstName ?? ""} ${w.writerLastName ?? ""}`.trim();
      const ipi = w.writerIPI?.trim() || null;
      if (!name && !ipi) return null;
      return { name: name || ipi || "", ipi };
    })
    .filter((w): w is { name: string; ipi: string | null } => w !== null);

  const catalogEnrich = {
    ...row.catalogEnrich,
    enrichedAt: row.catalogEnrich?.enrichedAt ?? new Date().toISOString(),
    mlcWorkFetched: true,
    mlcWorkSongCode: hit.mlcSongCode,
    mlcTitleMatch: true,
    mlcWriters: mlcWriters.length > 0 ? mlcWriters : row.catalogEnrich?.mlcWriters,
  };
  const keptIssues = row.issues.filter((i) => i.type !== "no_iswc");
  return {
    ...row,
    iswc: row.iswc?.trim() || hit.iswc?.trim() || row.iswc,
    catalogEnrich,
    issues: keptIssues,
  };
}

export interface MlcWriterSearchEnrichResult {
  rows: AuditRow[];
  filled: number;
  lookups: number;
  titlesMatched: number;
  titlesQueried: number;
  skippedReason?: "no_api" | "no_titles" | "no_writer";
}

export async function applyMlcWriterSearchEnrichment(
  rows: AuditRow[],
  options: {
    artistName?: string;
    legalName?: string | null;
    writerIpi?: string | null;
    spotifyByIsrc?: Map<string, SearchTrackHit>;
    /** When set (hybrid audit), only these rows supply search titles — not ARTISJUS film rows. */
    titleSourceRows?: AuditRow[];
    maxLookups?: number;
  },
): Promise<MlcWriterSearchEnrichResult> {
  const spotifyByIsrc = options.spotifyByIsrc ?? new Map<string, SearchTrackHit>();
  const titleRows = options.titleSourceRows ?? rows;

  const titles: string[] = [];
  for (const row of titleRows) {
    if (row.iswc?.trim()) continue;
    titles.push(...rowTitles(row, spotifyByIsrc));
  }

  if (titles.length === 0) {
    return { rows, filled: 0, lookups: 0, titlesMatched: 0, titlesQueried: 0, skippedReason: "no_titles" };
  }

  const { hitsByTitle, lookups } = await searchMlcWriterWorksForTitles(titles, {
    legalName: options.legalName,
    artistName: options.artistName,
    writerIpi: options.writerIpi,
    maxLookups: options.maxLookups,
  });

  if (lookups === 0) {
    return {
      rows,
      filled: 0,
      lookups: 0,
      titlesMatched: 0,
      titlesQueried: titles.length,
      skippedReason: mlcWorksApiAvailable() ? "no_writer" : "no_api",
    };
  }

  if (hitsByTitle.size === 0) {
    return { rows, filled: 0, lookups, titlesMatched: 0, titlesQueried: titles.length };
  }

  const discoveredWriters = new Map<string, { name: string; ipi: string | null }>();
  for (const hit of hitsByTitle.values()) {
    for (const w of hit.writers) {
      const name = `${w.writerFirstName ?? ""} ${w.writerLastName ?? ""}`.trim();
      const ipi = w.writerIPI?.trim() || null;
      const key = ipi ?? name.toUpperCase();
      if (!key) continue;
      discoveredWriters.set(key, { name: name || ipi || "", ipi });
    }
  }

  let filled = 0;
  let attachedWriters = false;
  const out = rows.map((row) => {
    if (row.iswc?.trim()) return row;
    for (const title of rowTitles(row, spotifyByIsrc)) {
      const hit = hitsByTitle.get(title);
      if (!hit) continue;
      const picked = pickBestMlcWorkSearchHit([hit], title, options.writerIpi);
      if (!picked?.iswc?.trim() && !picked?.mlcSongCode) continue;
      filled += 1;
      return applyMlcWorkHitToRow(row, picked);
    }
    if (!attachedWriters && discoveredWriters.size > 0) {
      attachedWriters = true;
      const writers = [...discoveredWriters.values()];
      return {
        ...row,
        catalogEnrich: {
          ...row.catalogEnrich,
          enrichedAt: row.catalogEnrich?.enrichedAt ?? new Date().toISOString(),
          mlcWriters: writers,
        },
      };
    }
    return row;
  });

  return { rows: out, filled, lookups, titlesMatched: hitsByTitle.size, titlesQueried: titles.length };
}
