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

export interface ArtisjusArtistMatch {
  work: ArtisjusWork;
  score: number;
}
