export interface ArtisjusWork {
  mukod: string;
  mucim: string;
  eloadok: string;
  jogosultak: string;
  rowCount: number;
  foreignOnly: boolean;
  hasForeign: boolean;
  hasRightsHolder: boolean;
  feloTips: string[];
  topSources: string[];
}

export interface ArtisjusMatchResult {
  matched: boolean;
  score: number;
  work?: ArtisjusWork;
}

/** Which ARTISJUS field(s) matched the artist query. */
export type ArtisjusMatchKind = "performer" | "rights" | "both";

export interface ArtisjusArtistMatch {
  work: ArtisjusWork;
  score: number;
  /** performer = eloadok, rights = jogosultak only, both = both fields. */
  matchKind?: ArtisjusMatchKind;
}
