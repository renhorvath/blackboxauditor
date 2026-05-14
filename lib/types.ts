export type IssueType =
  | "no_iswc"
  | "no_mlc_match"
  | "not_in_mlc"
  | "incomplete_shares"
  | "missing_shares"
  | "over_allocated"
  | "no_songwriter"
  | "missing_ipi_mlc"
  | "not_found";

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

export const SESSION_STORAGE_KEY = "music-metadata-auditor:v1";

export interface StoredAuditPayload {
  rows: AuditRow[];
  summary: AuditSummary;
  generatedAt: string;
}
