import type { CmoSourceId } from "@/lib/cmo-types";
import type { CmoWebSourceId } from "@/lib/cmo-web/web-types";

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
  | "artisjus_partial_rights"
  | "cmo_unmatched"
  | "mlc_unclaimed_share"
  | "eji_unidentified"
  | "cmo_web_unidentified";

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
  cmoHits?: {
    source: CmoSourceId;
    recordId: string;
    title: string;
    score: number;
    senaRole?: "producenten" | "muzikanten";
    senaScope?: "nederland" | "buitenland";
    remark?: string | null;
    identification?: string | null;
    performer?: string | null;
    composer?: string | null;
    label?: string | null;
    isrc?: string | null;
    gvlList?: "listen-artists" | "listen-producers" | "produktionen" | "sendemeldungen";
    gvlYear?: number;
    gvlMedium?: string;
    gvlRemix?: string | null;
  }[];
  ejiHits?: {
    kind: "track" | "artist";
    recordId: string;
    title?: string;
    mainArtist?: string;
    publisher?: string;
    publicationYear?: number | null;
    album?: string;
    tipus?: string;
    name?: string;
    distributionPeriod?: string;
  }[];
  cmoWebHits?: {
    source: CmoWebSourceId;
    recordId: string;
    title: string;
    identification: string;
    detail?: string | null;
    claimUrl?: string | null;
  }[];
  mlcUnclaimed?: boolean;
  mlcUnclaimedPct?: number | null;
  mlcWorkRecordId?: string | null;
  mlcDspResourceId?: string | null;
  mlcProvider?: string | null;
  mlcResourceType?: string | null;
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

export function isCmoSyntheticIsrc(isrc: string): boolean {
  return isrc.startsWith("cmo:");
}

export function isEjiSyntheticIsrc(isrc: string): boolean {
  return isrc.startsWith("eji:");
}

export function isSyntheticAuditIsrc(isrc: string): boolean {
  return isArtisjusSyntheticIsrc(isrc) || isCmoSyntheticIsrc(isrc) || isEjiSyntheticIsrc(isrc);
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
  mlcUnclaimedCount: number;
  artisjusCount: number;
  cmoCounts?: Partial<Record<CmoSourceId, number>>;
  cmoWebCounts?: Partial<Record<CmoWebSourceId, number>>;
  ejiCount?: number;
  ejiFromCache?: boolean;
  cmoWebFromCache?: boolean;
  queryApiUsed?: boolean;
  /** Where MLC/ARTISJUS/CMO data came from (EJI always from current host). */
  dataBackend?: "local" | "query-api" | "unavailable";
  mlcScanSource: "cache" | "duckdb" | "live" | "remote" | "none";
  mlcUnclaimedScanSource: "cache" | "duckdb" | "live" | "remote" | "none";
  /** MLC unmatched omitted (ARTIST_AUDIT_SKIP_MLC / _UNMATCHED on Vercel). */
  mlcUnmatchedSkipped?: boolean;
  /** MLC unclaimed omitted (ARTIST_AUDIT_SKIP_MLC_ALL on Vercel). */
  mlcUnclaimedSkipped?: boolean;
  /** Fast phase returned; MLC follow-up still running or pending in the UI. */
  mlcPending?: boolean;
  /** A×B gap counts on payout-problem rows (Sprint 2 header). */
  catalogGaps?: {
    missingIswc: number;
    listedAndRegistered: number;
    nameOnly: number;
  };
  /** At least one A-side identifier on rows (enables catalog lens for users). */
  catalogReady?: boolean;
  /** Which indexes were reachable on the data backend (if any). */
  sourceCapabilities?: {
    catalog: boolean;
    artisjusIndex: boolean;
    cmoIndex: boolean;
  };
  albumsScanned?: number;
  cappedByAlbums?: boolean;
  cappedByTracks?: boolean;
}
