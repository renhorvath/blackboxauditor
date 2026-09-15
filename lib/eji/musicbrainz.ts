/**
 * MusicBrainz recording lookup by ISRC — credits / conductor for EJI adatlap.
 * Public API, polite User-Agent + 1 req/s friendly delay handled by caller batching.
 */

export type MbRecordingEnrichment = {
  recordingId: string;
  title: string;
  artistCredits: string[];
  /** Approximate orchestra / band size from credit count when useful */
  creditCount: number;
  hasConductor: boolean;
  conductorNames: string[];
  composerNames: string[];
  isClassicalSuspect: boolean;
  releaseYear: string | null;
  label: string | null;
};

const UA =
  "EastasteEjiPoc/0.1 (recovery-ops; https://github.com/local/blackbox_auditor)";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchMbByIsrc(
  isrc: string,
): Promise<MbRecordingEnrichment | null> {
  const clean = isrc.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length < 12) return null;

  const url =
    `https://musicbrainz.org/ws/2/isrc/${encodeURIComponent(clean)}` +
    `?fmt=json&inc=artist-credits+releases+labels+artist-rels`;

  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (res.status === 404) return null;
  if (res.status === 503 || res.status === 429) {
    await sleep(1100);
    const retry = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
    });
    if (!retry.ok) return null;
    return parseMbIsrcResponse(await retry.json());
  }
  if (!res.ok) return null;
  return parseMbIsrcResponse(await res.json());
}

type MbJson = {
  recordings?: {
    id?: string;
    title?: string;
    score?: number;
    "artist-credit"?: { name?: string; artist?: { name?: string; type?: string } }[];
    releases?: {
      date?: string;
      "release-group"?: { "primary-type"?: string; secondary?: string[] };
      "label-info"?: { label?: { name?: string } }[];
    }[];
    relations?: {
      type?: string;
      direction?: string;
      artist?: { name?: string; type?: string };
    }[];
  }[];
};

function parseMbIsrcResponse(json: unknown): MbRecordingEnrichment | null {
  const data = json as MbJson;
  const recs = data.recordings ?? [];
  if (recs.length === 0) return null;
  const rec = [...recs].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (!rec?.id) return null;

  const credits = (rec["artist-credit"] ?? [])
    .map((c) => c.name || c.artist?.name || "")
    .filter(Boolean);

  const conductors: string[] = [];
  const composers: string[] = [];
  for (const rel of rec.relations ?? []) {
    const t = (rel.type || "").toLowerCase();
    if (t.includes("conductor") && rel.artist?.name) {
      conductors.push(rel.artist.name);
    }
    if (
      (t.includes("composer") || t === "writer") &&
      rel.artist?.name
    ) {
      composers.push(rel.artist.name);
    }
  }

  const releases = rec.releases ?? [];
  let releaseYear: string | null = null;
  let label: string | null = null;
  for (const rel of releases) {
    if (!releaseYear && rel.date) {
      const y = rel.date.slice(0, 4);
      if (/^\d{4}$/.test(y)) releaseYear = y;
    }
    if (!label) {
      const ln = rel["label-info"]?.[0]?.label?.name;
      if (ln) label = ln;
    }
  }

  const typeBlob = releases
    .map((r) => r["release-group"]?.["primary-type"] || "")
    .join(" ")
    .toLowerCase();
  const titleBlob = `${rec.title || ""} ${credits.join(" ")}`.toLowerCase();
  const isClassicalSuspect =
    Boolean(conductors.length) ||
    Boolean(composers.length) ||
    /\b(symphony|concerto|sonata|quartet|op\.|rv\s*\d|bwv|verseny|szimfón)/i.test(
      titleBlob,
    ) ||
    typeBlob.includes("classical");

  return {
    recordingId: rec.id,
    title: rec.title || "",
    artistCredits: credits,
    creditCount: credits.length,
    hasConductor: conductors.length > 0,
    conductorNames: conductors,
    composerNames: [...new Set(composers)],
    isClassicalSuspect,
    releaseYear,
    label,
  };
}

/** Sequential ISRC lookups with MB rate limit (~1/s). Cap for PoC. */
export async function enrichIsrcsWithMb(
  isrcs: string[],
  maxLookups = 25,
): Promise<Map<string, MbRecordingEnrichment>> {
  const out = new Map<string, MbRecordingEnrichment>();
  const uniq = [...new Set(isrcs.map((i) => i.replace(/[^A-Za-z0-9]/g, "").toUpperCase()).filter((i) => i.length >= 12))];
  let n = 0;
  for (const isrc of uniq) {
    if (n >= maxLookups) break;
    try {
      const hit = await fetchMbByIsrc(isrc);
      n += 1;
      if (hit) out.set(isrc, hit);
    } catch {
      /* ignore */
    }
    await sleep(1100);
  }
  return out;
}
