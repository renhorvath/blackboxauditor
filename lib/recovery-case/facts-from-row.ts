import type { CanonicalFacts } from "@/lib/recovery-case/types";
import type { AuditRow } from "@/lib/types";
import { isSyntheticAuditIsrc } from "@/lib/types";

export function canonicalFactsFromRow(
  row: AuditRow,
  options?: { legalName?: string | null; artistDisplayName?: string },
): CanonicalFacts {
  const isrc =
    row.isrc && !isSyntheticAuditIsrc(row.isrc) ? row.isrc.trim() : null;

  const gvlHit = row.cmoHits?.find((h) => h.source === "de-gvl");
  const produktionsnummer = gvlHit?.recordId?.trim() || null;
  const labelFromGvl = gvlHit?.label?.trim() || null;

  return {
    title: row.title?.trim() || null,
    performerName: row.artist?.trim() || null,
    legalName: options?.legalName?.trim() || null,
    mainArtist: row.artist?.trim() || options?.artistDisplayName?.trim() || null,
    isrc,
    iswc: row.iswc?.trim() || null,
    releaseYear: null,
    releaseDate: null,
    label: labelFromGvl,
    upc: null,
    spotifyUrl: null,
    writers: row.songwriterCount > 0 ? `${row.songwriterCount} songwriter(s) on file` : null,
    publishers: row.publisherCount > 0 ? `${row.publisherCount} publisher(s) on file` : null,
    produktionsnummer,
    artisjusMukod: row.artisjusMukod?.trim() || null,
    mlcSongCode: null,
    mlcWorkRecordId: row.mlcWorkRecordId?.trim() || null,
  };
}
