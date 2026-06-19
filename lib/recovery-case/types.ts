import type { GapBadge } from "@/lib/audit-core/gap-types";

/** CMO-semleges mezőkulcsok — minden adapter innen olvas. */
export type CanonicalKey =
  | "title"
  | "performerName"
  | "legalName"
  | "mainArtist"
  | "isrc"
  | "iswc"
  | "releaseYear"
  | "releaseDate"
  | "label"
  | "upc"
  | "spotifyUrl"
  | "writers"
  | "publishers"
  | "produktionsnummer"
  | "artisjusMukod"
  | "mlcSongCode"
  | "mlcWorkRecordId";

export type RecoveryTargetStatus = "ready" | "partial" | "blocked";

/** A oldal + join — egy helyen, CMO-függetlenül. */
export interface CanonicalFacts {
  title: string | null;
  performerName: string | null;
  legalName: string | null;
  mainArtist: string | null;
  isrc: string | null;
  iswc: string | null;
  releaseYear: number | null;
  releaseDate: string | null;
  label: string | null;
  upc: string | null;
  spotifyUrl: string | null;
  writers: string | null;
  publishers: string | null;
  produktionsnummer: string | null;
  artisjusMukod: string | null;
  mlcSongCode: string | null;
  mlcWorkRecordId: string | null;
}

/** B oldal — egy konkrét black box lista-bejegyzés. */
export interface BlackboxHit {
  source: string;
  recordId: string;
  playbookId: string;
  region?: string;
  listType?: string;
  headline?: string;
}

/** Egy CMO recovery út ehhez a case-hez. */
export interface RecoveryTarget {
  playbookId: string;
  status: RecoveryTargetStatus;
  missingFields: CanonicalKey[];
  filledFields: CanonicalKey[];
}

/** Master gap / recovery rekord — egy finding (dal vagy szintetikus mű-sor). */
export interface RecoveryCase {
  caseId: string;
  findingKey: string;
  artistSlug: string;
  artistDisplayName: string;
  facts: CanonicalFacts;
  blackboxHits: BlackboxHit[];
  gapBadges: GapBadge[];
  recoveryTargets: RecoveryTarget[];
  generatedAt: string;
}

export interface RecoveryCaseBundle {
  version: 1;
  artistSlug: string;
  artistDisplayName: string;
  generatedAt: string;
  caseCount: number;
  cases: RecoveryCase[];
}
