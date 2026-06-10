export const CMO_WEB_SOURCE_IDS = ["zaiks", "sacem", "spedidam", "sami", "koda", "prs", "sgae", "buma"] as const;

export type CmoWebSourceId = (typeof CMO_WEB_SOURCE_IDS)[number];

export interface CmoWebHit {
  source: CmoWebSourceId;
  id: string;
  title: string;
  identification: string;
  detail?: string | null;
  claimUrl?: string | null;
}

export interface CmoWebSearchResult {
  source: CmoWebSourceId;
  query: string;
  hits: CmoWebHit[];
  fetchedAt: string;
  fromCache: boolean;
  error?: string;
}

export const CMO_WEB_LABELS: Record<CmoWebSourceId, string> = {
  zaiks: "ZAiKS (PL)",
  sacem: "SACEM ONI (FR)",
  spedidam: "Franciaország · SPEDIDAM",
  sami: "Svédország · SAMI",
  koda: "KODA (DK)",
  prs: "PRS (UK)",
  sgae: "SGAE (ES)",
  buma: "BUMA/Stemra (NL)",
};
