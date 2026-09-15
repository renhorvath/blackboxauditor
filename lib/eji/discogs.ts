/**
 * Discogs database search / release — label + year + extraartist credits for EJI adatlap.
 * Auth: DISCOGS_TOKEN (Personal Access Token) in .env.local
 * https://www.discogs.com/developers
 */

export type DiscogsEnrichment = {
  releaseId: number;
  title: string;
  label: string | null;
  releaseYear: string | null;
  artistCredits: string[];
  extraArtists: string[];
  /** Composer / Written-By szerepek a Discogs extraartists-ből */
  composers: string[];
};

const UA = "EastasteEjiPoc/0.1 +https://eastaste.com";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\w\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function discogsLookupKey(artist: string, title: string): string {
  return `${fold(artist)}||${fold(title)}`;
}

function token(): string | null {
  const t = process.env.DISCOGS_TOKEN?.trim();
  return t || null;
}

async function discogsGet(pathAndQuery: string): Promise<unknown | null> {
  const tok = token();
  if (!tok) return null;
  const url = pathAndQuery.startsWith("http")
    ? pathAndQuery
    : `https://api.discogs.com${pathAndQuery}`;

  const headers: Record<string, string> = {
    Authorization: `Discogs token=${tok}`,
    "User-Agent": UA,
    Accept: "application/json",
  };

  const res = await fetch(url, { headers });
  if (res.status === 429 || res.status === 503) {
    await sleep(1500);
    const retry = await fetch(url, { headers });
    if (!retry.ok) return null;
    return retry.json();
  }
  if (!res.ok) return null;
  return res.json();
}

type SearchResult = {
  id?: number;
  title?: string;
  year?: string | number;
  label?: string[];
  type?: string;
  format?: string[];
};

type SearchJson = { results?: SearchResult[] };

type ReleaseJson = {
  id?: number;
  title?: string;
  year?: string | number;
  labels?: { name?: string }[];
  artists?: { name?: string }[];
  extraartists?: { name?: string; role?: string }[];
  tracklist?: {
    title?: string;
    artists?: { name?: string }[];
    extraartists?: { name?: string; role?: string }[];
  }[];
};

function yearStr(y: string | number | undefined): string | null {
  if (y == null || y === "") return null;
  const s = String(y).slice(0, 4);
  return /^\d{4}$/.test(s) ? s : null;
}

function scoreSearchHit(
  hit: SearchResult,
  artist: string,
  title: string,
): number {
  const blob = fold(hit.title || "");
  const a = fold(artist);
  const t = fold(title);
  let score = 0;
  if (t && blob.includes(t)) score += 50;
  if (a && blob.includes(a)) score += 30;
  if (hit.type === "release") score += 10;
  if (hit.label?.length) score += 5;
  if (yearStr(hit.year)) score += 5;
  // Prefer vinyl/CD over miscellaneous
  const fmt = (hit.format || []).join(" ").toLowerCase();
  if (/\b(album|lp|cd|vinyl)\b/.test(fmt)) score += 5;
  return score;
}

async function fetchRelease(id: number): Promise<DiscogsEnrichment | null> {
  const json = (await discogsGet(`/releases/${id}`)) as ReleaseJson | null;
  if (!json?.id) return null;

  const label =
    json.labels?.map((l) => l.name).filter(Boolean)[0] || null;
  const artistCredits = (json.artists || [])
    .map((a) => (a.name || "").replace(/\s*\(\d+\)\s*$/, "").trim())
    .filter(Boolean);
  const extraArtists = (json.extraartists || [])
    .map((a) => (a.name || "").replace(/\s*\(\d+\)\s*$/, "").trim())
    .filter(Boolean);
  const composers = [
    ...new Set(
      (json.extraartists || [])
        .filter((a) => /composer|written-?by|music by/i.test(a.role || ""))
        .map((a) => (a.name || "").replace(/\s*\(\d+\)\s*$/, "").trim())
        .filter(Boolean),
    ),
  ];

  return {
    releaseId: json.id,
    title: json.title || "",
    label,
    releaseYear: yearStr(json.year),
    artistCredits,
    extraArtists,
    composers,
  };
}

/**
 * Search Discogs for a release matching artist + track title.
 * Uses search result label/year when enough; fetches full release when credits needed
 * or label missing from search hit.
 */
export async function enrichTrackWithDiscogs(opts: {
  artist: string;
  title: string;
  needCredits?: boolean;
}): Promise<DiscogsEnrichment | null> {
  if (!token()) return null;
  const artist = opts.artist.trim();
  const title = opts.title.trim();
  if (!artist || !title) return null;

  const params = new URLSearchParams({
    type: "release",
    per_page: "8",
    artist,
    track: title,
  });
  let json = (await discogsGet(
    `/database/search?${params.toString()}`,
  )) as SearchJson | null;

  // Fallback: free-text q if artist+track empty
  if (!json?.results?.length) {
    const q = new URLSearchParams({
      type: "release",
      per_page: "8",
      q: `${artist} ${title}`,
    });
    json = (await discogsGet(
      `/database/search?${q.toString()}`,
    )) as SearchJson | null;
  }

  const results = json?.results ?? [];
  if (!results.length) return null;

  const ranked = [...results]
    .map((r) => ({ r, score: scoreSearchHit(r, artist, title) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 40 || !best.r.id) return null;

  const searchLabel = best.r.label?.[0] || null;
  const searchYear = yearStr(best.r.year);

  if (!opts.needCredits && searchLabel) {
    return {
      releaseId: best.r.id,
      title: best.r.title || title,
      label: searchLabel,
      releaseYear: searchYear,
      artistCredits: [],
      extraArtists: [],
      composers: [],
    };
  }

  const full = await fetchRelease(best.r.id);
  if (!full) {
    return {
      releaseId: best.r.id,
      title: best.r.title || title,
      label: searchLabel,
      releaseYear: searchYear,
      artistCredits: [],
      extraArtists: [],
      composers: [],
    };
  }
  return {
    ...full,
    label: full.label || searchLabel,
    releaseYear: full.releaseYear || searchYear,
  };
}

/** Sequential Discogs lookups. Cap for PoC; ~1 req/s polite. */
export async function enrichTracksWithDiscogs(
  queries: { artist: string; title: string; needCredits?: boolean }[],
  maxLookups = 12,
): Promise<Map<string, DiscogsEnrichment>> {
  const out = new Map<string, DiscogsEnrichment>();
  if (!token()) return out;

  const seen = new Set<string>();
  let n = 0;
  for (const q of queries) {
    if (n >= maxLookups) break;
    const key = discogsLookupKey(q.artist, q.title);
    if (!key.replace(/\|/g, "") || seen.has(key)) continue;
    seen.add(key);
    try {
      const hit = await enrichTrackWithDiscogs(q);
      n += 1;
      if (hit) out.set(key, hit);
    } catch {
      n += 1;
    }
    await sleep(1100);
  }
  return out;
}

export function discogsConfigured(): boolean {
  return Boolean(token());
}
