export type IssueType =
  | "no_iswc"
  | "no_mlc_match"
  | "not_in_mlc"
  | "incomplete_shares"
  | "missing_shares"
  | "over_allocated"
  | "no_songwriter"
  | "missing_ipi_mlc"
  | "not_found"
  | "artisjus_unmatched"
  | "artisjus_foreign_only"
  | "artisjus_partial_rights";

export type IssueSeverity = "critical" | "warning" | "info";

export interface AuditIssue {
  type: IssueType;
  severity: IssueSeverity;
  message: string;
  action: string;
}

export interface AuditRow {
  isrc: string;
  title: string | null;
  artist: string | null;
  iswc: string | null;
  mlcMatchStatus: "matched" | "unmatched" | "not_in_mlc" | "unknown";
  shareTotal: number | null;
  shareStatus: "complete" | "incomplete" | "over_allocated" | "missing";
  songwriterCount: number;
  publisherCount: number;
  issues: AuditIssue[];
  rawBatchData: unknown;
  artisjusMatched?: boolean;
  artisjusScore?: number | null;
  artisjusMukod?: string | null;
  artisjusRowCount?: number | null;
  artisjusFeloTips?: string[];
  artisjusTopSources?: string[];
  artisjusForeignOnly?: boolean;
}

export interface AuditSummary {
  total: number;
  withCriticalIssues: number;
  withIswcMissing: number;
  withMlcUnmatched: number;
  withIncompleteShares: number;
  withMissingShares: number;
  withMissingIpiMlc: number;
  withNoSongwriter: number;
  withArtisjusUnmatched: number;
  notFound: number;
}

/** credits.fm /v1/batch recording payload */
export interface BatchRecordingData {
  isrc?: string;
  title?: string;
  artists?: { name?: string }[];
  iswc?: string | null;
  songwriters?: unknown[];
  publishers?: unknown[];
  mlc_song_code?: string | null;
  mlc_portal_url?: string | null;
  /** credits.fm API — contributing sources for this snapshot */
  sources?: string[];
  /** credits.fm API — known gaps on the indexed row */
  missing_fields?: string[];
  match_status?: string;
}

export interface BatchResult {
  id: string;
  type: string;
  found: boolean;
  data?: BatchRecordingData | null;
}

export interface ShareAuditResult {
  isrc: string;
  total_share: number | null;
  share_status: "complete" | "incomplete" | "missing" | "over_allocated";
  songwriter_count?: number;
  missing_share?: number | null;
}

export interface UnmatchedAuditResult {
  isrc: string;
  matched: boolean;
  match_status: "matched" | "unmatched" | "not_in_mlc";
}

export interface SearchTrackHit {
  spotifyId: string;
  title: string;
  artists: string[];
  album: string | null;
  isrc: string | null;
}

export interface SearchArtistHit {
  spotifyId: string;
  name: string;
  followers: number | null;
  genres: string[];
  imageUrl: string | null;
}

export const ARTISJUS_ISRC_PREFIX = "artisjus:";

export function isArtisjusSyntheticIsrc(isrc: string): boolean {
  return isrc.startsWith(ARTISJUS_ISRC_PREFIX);
}

export const SESSION_STORAGE_KEY = "music-metadata-auditor:v1";

export interface StoredAuditPayload {
  rows: AuditRow[];
  summary: AuditSummary;
  generatedAt: string;
}

export type ArtistAuditScope = "top15" | "full";

export interface ArtistAuditMeta {
  artistName: string;
  scope: ArtistAuditScope;
  /** @deprecated Spotify no longer drives artist audit rows */
  spotifyTrackCount: number;
  isrcCount: number;
  mlcUnmatchedCount: number;
  artisjusCount: number;
  mlcScanSource: "cache" | "live" | "none";
  albumsScanned?: number;
  cappedByAlbums?: boolean;
  cappedByTracks?: boolean;
}
