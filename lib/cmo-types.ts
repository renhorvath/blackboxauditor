export const CMO_SOURCE_IDS = [
  "at-akm",
  "at-aume",
  "nl-sena",
  "se-stim",
  "sk-soza",
  "ro-credidam",
  "hr-hds-zamp",
  "ro-ucmr-ada",
  "ee-eau",
  "ee-eel",
  "cz-intergram",
  "fi-gramex",
] as const;

export type CmoSourceId = (typeof CMO_SOURCE_IDS)[number];

export interface CmoRecord {
  id: string;
  source: CmoSourceId;
  title: string;
  /** Search/display blob — composer · performer, or source-specific text (e.g. AKM Identifikation) */
  identification: string;
  remark: string | null;
  performer?: string | null;
  composer?: string | null;
  label?: string | null;
  /** Neighbouring-rights subtype (SENA only) */
  senaRole?: "producenten" | "muzikanten";
  /** SENA list: Dutch domestic vs. foreign exploitation */
  senaScope?: "nederland" | "buitenland";
  isrc?: string | null;
  sheet?: string;
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
  sources: Partial<
    Record<
      CmoSourceId,
      CmoSourceMeta & {
        records: CmoRecord[];
        tokenIndex: Record<string, number[]>;
      }
    >
  >;
}

export const CMO_SOURCE_LABELS: Record<CmoSourceId, string> = {
  "at-akm": "AKM (AT)",
  "at-aume": "AUME (AT)",
  "nl-sena": "SENA (NL)",
  "se-stim": "STIM (SE)",
  "sk-soza": "SOZA (SK)",
  "ro-credidam": "CREDIDAM (RO)",
  "hr-hds-zamp": "HDS-ZAMP (HR)",
  "ro-ucmr-ada": "UCMR-ADA (RO)",
  "ee-eau": "EAÜ (EE)",
  "ee-eel": "EEL (EE)",
  "cz-intergram": "INTERGRAM (CZ)",
  "fi-gramex": "Gramex (FI)",
};

export const CMO_CHIP_LABELS: Record<CmoSourceId, string> = {
  "at-akm": "Ausztria · AKM",
  "at-aume": "Ausztria · AUME",
  "nl-sena": "Hollandia · SENA",
  "se-stim": "Svédország · STIM",
  "sk-soza": "Szlovákia · SOZA",
  "ro-credidam": "Románia · CREDIDAM",
  "hr-hds-zamp": "Horvátország · HDS-ZAMP",
  "ro-ucmr-ada": "Románia · UCMR-ADA",
  "ee-eau": "Észtország · EAÜ",
  "ee-eel": "Észtország · EEL",
  "cz-intergram": "Csehország · INTERGRAM",
  "fi-gramex": "Finnország · Gramex",
};

export const CMO_ISRC_PREFIX = "cmo:";
