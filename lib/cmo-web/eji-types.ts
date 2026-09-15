/** EJI jogosultkutatás — hangfelvétel keresés (track tab). */
export interface EjiTrackHit {
  kind: "track";
  id: string;
  tipus: string;
  mainArtist: string;
  title: string;
  publisher: string;
  publicationYear: number | null;
  album: string;
  performersNum: number;
  mainArtistsNum: number;
}

/** EJI jogosultkutatás — előadóművész keresés (artist tab). */
export interface EjiArtistHit {
  kind: "artist";
  refId: string;
  name: string;
  distributionPeriod: string;
}

export type EjiHit = EjiTrackHit | EjiArtistHit;

export interface EjiSearchResult {
  query: string;
  trackHits: EjiTrackHit[];
  artistHits: EjiArtistHit[];
  fetchedAt: string;
  fromCache: boolean;
}

export const EJI_TRACK_SEARCH_URL = "https://eji.hu/jogosultkutatas/track/hu/1";
export const EJI_ARTIST_SEARCH_URL = "https://eji.hu/jogosultkutatas/artist/hu/1";
export const EJI_ISRC_PREFIX = "eji:";
