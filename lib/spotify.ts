import type { SearchArtistHit, SearchTrackHit } from "@/lib/types";

type TokenCache = { accessToken: string; expiresAtMs: number };

let tokenCache: TokenCache | null = null;

async function getClientCredentialsToken(): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SPOTIFY_CLIENT_ID és SPOTIFY_CLIENT_SECRET szükséges.");
  }

  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAtMs - 60_000) {
    return tokenCache.accessToken;
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!res.ok) {
    throw new Error(`Spotify token hiba: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: data.access_token,
    expiresAtMs: now + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

type SpotifyTrackApi = {
  id: string;
  name: string;
  artists?: { name?: string }[];
  album?: { name?: string };
  external_ids?: { isrc?: string };
};

function mapTrackItem(t: SpotifyTrackApi): SearchTrackHit {
  return {
    spotifyId: t.id,
    title: t.name,
    artists: (t.artists ?? []).map((a) => a.name ?? "").filter(Boolean),
    album: t.album?.name ?? null,
    isrc: t.external_ids?.isrc ?? null,
  };
}

export async function fetchSpotifyTrackById(trackId: string): Promise<SearchTrackHit | null> {
  const token = await getClientCredentialsToken();
  const res = await fetch(
    `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Spotify track hiba: ${res.status}`);
  }
  const t = (await res.json()) as SpotifyTrackApi;
  return mapTrackItem(t);
}

export async function fetchSpotifyArtistById(
  artistId: string,
): Promise<{ id: string; name: string } | null> {
  const token = await getClientCredentialsToken();
  const res = await fetch(
    `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Spotify előadó hiba: ${res.status}`);
  }
  const json = (await res.json()) as { id?: string; name?: string };
  if (!json.id || !json.name) return null;
  return { id: json.id, name: json.name };
}

export async function fetchSpotifyArtistTopTracks(
  artistId: string,
  limit = 15,
): Promise<SearchTrackHit[]> {
  const token = await getClientCredentialsToken();
  const market = (process.env.SPOTIFY_DISCOGRAPHY_MARKET ?? "HU").trim() || "HU";
  const params = new URLSearchParams({ market });
  const res = await fetch(
    `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/top-tracks?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(`Spotify előadó top dalok hiba: ${res.status}`);
  }
  const json = (await res.json()) as { tracks?: SpotifyTrackApi[] };
  const tracks = json.tracks ?? [];
  return tracks.slice(0, limit).map(mapTrackItem);
}

function normalizeArtistName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchSpotifyArtists(
  query: string,
  limit = 10,
): Promise<SearchArtistHit[]> {
  const token = await getClientCredentialsToken();
  const market = (process.env.SPOTIFY_DISCOGRAPHY_MARKET ?? "HU").trim() || "HU";
  const params = new URLSearchParams({
    q: query,
    type: "artist",
    limit: String(limit),
    market,
  });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Spotify előadó keresés hiba: ${res.status}`);
  }

  const json = (await res.json()) as {
    artists?: {
      items?: Array<{
        id: string;
        name: string;
        followers?: { total?: number };
        genres?: string[];
        images?: { url?: string }[];
      }>;
    };
  };

  const items = json.artists?.items ?? [];
  const mapped: SearchArtistHit[] = items.map((a) => ({
    spotifyId: a.id,
    name: a.name,
    followers: a.followers?.total ?? null,
    genres: a.genres ?? [],
    imageUrl: a.images?.[0]?.url ?? null,
  }));

  const target = normalizeArtistName(query);
  mapped.sort((a, b) => {
    const aExact = normalizeArtistName(a.name) === target ? 1 : 0;
    const bExact = normalizeArtistName(b.name) === target ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.followers ?? 0) - (a.followers ?? 0);
  });

  return mapped;
}

export async function searchSpotifyTracks(query: string, limit = 12): Promise<SearchTrackHit[]> {
  const token = await getClientCredentialsToken();
  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: String(limit),
  });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Spotify keresés hiba: ${res.status}`);
  }

  const json = (await res.json()) as {
    tracks?: {
      items?: Array<{
        id: string;
        name: string;
        artists?: { name?: string }[];
        album?: { name?: string };
        external_ids?: { isrc?: string };
      }>;
    };
  };

  const items = json.tracks?.items ?? [];

  return items.map((t) => mapTrackItem(t));
}

export type ArtistDiscographyResult = {
  tracks: SearchTrackHit[];
  albumsScanned: number;
  distinctTrackIds: number;
  cappedByAlbums: boolean;
  cappedByTracks: boolean;
};

/** Paginate Spotify artist albums + album tracks; hydrate ISRC via /tracks?ids= */
export function spotifyApiAvailable(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID?.trim() && process.env.SPOTIFY_CLIENT_SECRET?.trim(),
  );
}

export function buildSpotifyIsrcMap(tracks: SearchTrackHit[]): Map<string, SearchTrackHit> {
  const out = new Map<string, SearchTrackHit>();
  for (const track of tracks) {
    const isrc = track.isrc?.trim();
    if (!isrc) continue;
    const key = isrc.toUpperCase().replace(/-/g, "");
    if (!out.has(key)) out.set(key, track);
  }
  return out;
}

export async function resolveSpotifyArtistIdByName(artistName: string): Promise<string | null> {
  const query = artistName.trim();
  if (!query || !spotifyApiAvailable()) return null;
  const hits = await searchSpotifyArtists(query, 8);
  return hits[0]?.spotifyId ?? null;
}

export async function fetchSpotifyArtistIsrcMap(
  artistId: string,
): Promise<{ map: Map<string, SearchTrackHit>; trackCount: number }> {
  const discography = await fetchArtistDiscographyHits(artistId);
  const withIsrc = discography.tracks.filter((t) => t.isrc?.trim());
  return {
    map: buildSpotifyIsrcMap(withIsrc),
    trackCount: withIsrc.length,
  };
}

export async function fetchArtistDiscographyHits(artistId: string): Promise<ArtistDiscographyResult> {
  const token = await getClientCredentialsToken();
  const market = (process.env.SPOTIFY_DISCOGRAPHY_MARKET ?? "US").trim() || "US";
  const maxAlbums = Math.max(
    20,
    Math.min(2000, Number(process.env.SPOTIFY_DISCOGRAPHY_MAX_ALBUMS ?? 400) || 400),
  );
  const maxTracks = Math.max(
    50,
    Math.min(8000, Number(process.env.SPOTIFY_DISCOGRAPHY_MAX_TRACKS ?? 2500) || 2500),
  );

  const albumIds = new Set<string>();
  let albumsNext: string | null =
    `https://api.spotify.com/v1/artists/${encodeURIComponent(artistId)}/albums?` +
    new URLSearchParams({
      include_groups: "album,single,compilation,appears_on",
      limit: "50",
      market,
    }).toString();
  let cappedByAlbums = false;

  while (albumsNext && albumIds.size < maxAlbums) {
    const res = await fetch(albumsNext, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Spotify előadó albumok hiba: ${res.status}`);
    }
    const page = (await res.json()) as {
      items?: { id: string }[];
      next?: string | null;
    };
    for (const a of page.items ?? []) {
      if (albumIds.size >= maxAlbums) break;
      albumIds.add(a.id);
    }
    if (albumIds.size >= maxAlbums && page.next) {
      cappedByAlbums = true;
      albumsNext = null;
    } else {
      albumsNext = page.next ?? null;
    }
  }

  const trackIds = new Set<string>();
  let cappedByTracks = false;

  for (const albumId of albumIds) {
    if (trackIds.size >= maxTracks) break;
    let tracksNext: string | null =
      `https://api.spotify.com/v1/albums/${encodeURIComponent(albumId)}/tracks?` +
      new URLSearchParams({ limit: "50", market }).toString();

    while (tracksNext && trackIds.size < maxTracks) {
      const res = await fetch(tracksNext, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        throw new Error(`Spotify album tracklista hiba: ${res.status}`);
      }
      const tpage = (await res.json()) as {
        items?: { id?: string }[];
        next?: string | null;
      };
      for (const tr of tpage.items ?? []) {
        if (trackIds.size >= maxTracks) break;
        if (tr.id) trackIds.add(tr.id);
      }
      if (trackIds.size >= maxTracks && tpage.next) {
        cappedByTracks = true;
        tracksNext = null;
      } else {
        tracksNext =
          trackIds.size < maxTracks && tpage.next ? tpage.next : null;
      }
    }
  }

  const idList = [...trackIds];
  const tracks: SearchTrackHit[] = [];
  for (let i = 0; i < idList.length; i += 50) {
    const chunk = idList.slice(i, i + 50);
    const params = new URLSearchParams({ ids: chunk.join(",") });
    const res = await fetch(`https://api.spotify.com/v1/tracks?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Spotify track tömeges lekérés hiba: ${res.status}`);
    }
    const body = (await res.json()) as { tracks?: (SpotifyTrackApi | null)[] };
    for (const t of body.tracks ?? []) {
      if (t) tracks.push(mapTrackItem(t));
    }
  }

  tracks.sort((a, b) => {
    const c = a.title.localeCompare(b.title, "hu", { sensitivity: "base" });
    return c !== 0 ? c : a.spotifyId.localeCompare(b.spotifyId);
  });

  return {
    tracks,
    albumsScanned: albumIds.size,
    distinctTrackIds: trackIds.size,
    cappedByAlbums,
    cappedByTracks,
  };
}
