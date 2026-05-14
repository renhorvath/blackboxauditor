import type { SearchTrackHit } from "@/lib/types";

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

export async function fetchSpotifyArtistTopTracks(
  artistId: string,
  limit = 15,
): Promise<SearchTrackHit[]> {
  const token = await getClientCredentialsToken();
  const params = new URLSearchParams({ market: "US" });
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
