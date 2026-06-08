import type { ArtisjusMatchResult, ArtisjusWork } from "@/lib/artisjus-types";
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import { ARTISJUS_ISRC_PREFIX, type AuditIssue, type AuditRow } from "@/lib/types";

export interface ArtisjusTrackMatch {
  isrc: string;
  matched: boolean;
  score: number;
  work?: ArtisjusWork;
}

function artisjusIssuesFromWork(work: ArtisjusWork): AuditIssue[] {
  const issues: AuditIssue[] = [
    {
      type: "artisjus_unmatched",
      severity: "critical",
      message: `Az ARTISJUS 2025-ös azonosítatlan művek listáján szerepel (${work.rowCount} felosztási sor, műkód ${work.mukod}).`,
      action:
        "Ellenőrizd az ARTISJUS regisztrációt és a jogosult/IPI adatokat; indíts reklamációt vagy claimet a listán szereplő források alapján.",
    },
  ];

  if (work.foreignOnly) {
    issues.push({
      type: "artisjus_foreign_only",
      severity: "warning",
      message:
        "A tétel kizárólag külföldi reciprocity-forrásból (KA/KM) származik — a pénz külföldi CMO-tól érkezett, ARTISJUS nem tudta kiosztani.",
      action:
        "Egyeztess az ARTISJUS-szal és a forrásként szereplő külföldi CMO-val; ellenőrizd az IPI/ISWC regisztrációt mindkét oldalon.",
    });
  }

  if (work.hasRightsHolder) {
    issues.push({
      type: "artisjus_partial_rights",
      severity: "warning",
      message:
        "A listasorban szerepel jogosult név, mégis azonosítatlan — belső matching / share-probléma valószínű (nem teljes adathiány).",
      action:
        "Ellenőrizd a műregisztrációt, a share-megosztást és az ARTISJUS belső műkód-egyeztetést; Omega-szerű esetnél reklamáció indítható.",
    });
  }

  return issues;
}

/** Strip live/remix/feat noise so „MI LESZ? (LIVE)” ≈ „MI LESZ?” */
function normalizeTrackTitleForMatch(title: string): string {
  return normalizeArtisjusText(title)
    .replace(/\s*\(?\s*live\s*\)?/g, " ")
    .replace(/\s*-?\s*feat\.?.*$/g, "")
    .replace(/\s*\[.*?\]/g, " ")
    .replace(/\s*\(.*?(remix|mix|edit|version|verzió).*?\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findArtisjusWorkForTrackTitle(
  trackTitle: string | null | undefined,
  artistWorks: ArtisjusWork[],
): ArtisjusWork | undefined {
  if (!trackTitle?.trim() || artistWorks.length === 0) return undefined;
  const norm = normalizeTrackTitleForMatch(trackTitle);
  if (!norm) return undefined;

  for (const work of artistWorks) {
    const workNorm = normalizeTrackTitleForMatch(work.mucim);
    if (!workNorm) continue;
    if (norm === workNorm) return work;
    if (norm.includes(workNorm) && workNorm.length >= 8) return work;
    if (workNorm.includes(norm) && norm.length >= 8) return work;
  }
  return undefined;
}

/**
 * ARTISJUS jelölés csak az előadó-szintű keresés zárt halmazából,
 * nem a teljes index fuzzy match-e.
 */
export function linkArtisjusWorksToRows(
  rows: AuditRow[],
  artistWorks: ArtisjusWork[],
  scores?: Map<string, number>,
): AuditRow[] {
  if (artistWorks.length === 0) return rows;

  return rows.map((row) => {
    const work = findArtisjusWorkForTrackTitle(row.title, artistWorks);
    if (!work) return row;

    const issues: AuditIssue[] = [
      ...row.issues.filter((i) => i.type !== "artisjus_unmatched"),
      ...artisjusIssuesFromWork(work),
    ];

    return {
      ...row,
      artisjusMatched: true,
      artisjusScore: scores?.get(work.mukod) ?? null,
      artisjusMukod: work.mukod,
      artisjusRowCount: work.rowCount,
      artisjusFeloTips: work.feloTips,
      artisjusTopSources: work.topSources,
      artisjusForeignOnly: work.foreignOnly,
      issues,
    };
  });
}

export function buildArtisjusOnlyRow(work: ArtisjusWork, score?: number): AuditRow {
  return {
    isrc: `${ARTISJUS_ISRC_PREFIX}${work.mukod}`,
    title: work.mucim,
    artist: work.eloadok || work.jogosultak || null,
    iswc: null,
    mlcMatchStatus: "unknown",
    shareTotal: null,
    shareStatus: "missing",
    songwriterCount: 0,
    publisherCount: 0,
    issues: artisjusIssuesFromWork(work),
    rawBatchData: null,
    artisjusMatched: true,
    artisjusScore: score ?? null,
    artisjusMukod: work.mukod,
    artisjusRowCount: work.rowCount,
    artisjusFeloTips: work.feloTips,
    artisjusTopSources: work.topSources,
    artisjusForeignOnly: work.foreignOnly,
  };
}

export function appendArtisjusArtistWorks(
  rows: AuditRow[],
  works: ArtisjusWork[],
  scores?: Map<string, number>,
): AuditRow[] {
  const seenMukods = new Set(
    rows.map((r) => r.artisjusMukod).filter((m): m is string => Boolean(m)),
  );
  const extra: AuditRow[] = [];
  for (const work of works) {
    if (seenMukods.has(work.mukod)) continue;
    seenMukods.add(work.mukod);
    extra.push(buildArtisjusOnlyRow(work, scores?.get(work.mukod)));
  }
  return extra.length > 0 ? [...rows, ...extra] : rows;
}

export function applyArtisjusEnrichment(
  rows: AuditRow[],
  matches: ArtisjusTrackMatch[],
): AuditRow[] {
  const byIsrc = new Map(matches.map((m) => [m.isrc, m]));

  return rows.map((row) => {
    const match = byIsrc.get(row.isrc);
    if (!match?.matched || !match.work) {
      return {
        ...row,
        artisjusMatched: false,
        artisjusScore: match?.score ?? null,
      };
    }

    const work = match.work;
    const issues: AuditIssue[] = [...row.issues, ...artisjusIssuesFromWork(work)];

    return {
      ...row,
      artisjusMatched: true,
      artisjusScore: match.score,
      artisjusMukod: work.mukod,
      artisjusRowCount: work.rowCount,
      artisjusFeloTips: work.feloTips,
      artisjusTopSources: work.topSources,
      artisjusForeignOnly: work.foreignOnly,
      issues,
    };
  });
}

export function artisjusMatchFromResult(
  isrc: string,
  result: ArtisjusMatchResult,
): ArtisjusTrackMatch {
  return {
    isrc,
    matched: result.matched,
    score: result.score,
    work: result.work,
  };
}
