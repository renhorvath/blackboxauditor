export type CmoSourceId = "at-akm" | "at-aume" | "nl-sena";

export interface CmoRecord {
  id: string;
  source: CmoSourceId;
  title: string;
  identification: string;
  remark: string | null;
  /** Neighbouring-rights subtype (SENA only) */
  senaRole?: "producenten" | "muzikanten";
  isrc?: string | null;
}

export interface CmoArtistMatch {
  record: CmoRecord;
  score: number;
}

export interface CmoSourceMeta {
  organization: string;
  country: string;
  rightsType: "musical_work" | "mechanical" | "neighbouring";
  recordCount: number;
}

export interface CmoIndexFile {
  version: number;
  builtAt: string;
  sources: Record<
    CmoSourceId,
    CmoSourceMeta & {
      records: CmoRecord[];
      tokenIndex: Record<string, number[]>;
    }
  >;
}

export const CMO_SOURCE_LABELS: Record<CmoSourceId, string> = {
  "at-akm": "AKM (AT)",
  "at-aume": "AUME (AT)",
  "nl-sena": "SENA (NL)",
};

export const CMO_ISRC_PREFIX = "cmo:";
