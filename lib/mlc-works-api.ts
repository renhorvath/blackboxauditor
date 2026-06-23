/** MLC public API — musical work lookup by song code + recording search (themlc.com). */

export interface MlcRecordingHit {
  id: string;
  title: string;
  artist: string;
  isrc: string;
  mlcSongCode: string;
  labels?: string;
}

export interface MlcRecordingSearchQuery {
  isrc?: string;
  title?: string;
  artist?: string;
}

export interface MlcWorkWriter {
  writerFirstName?: string;
  writerLastName?: string;
  writerIPI?: string;
}

export interface MlcWorkPublisher {
  publisherName?: string;
  collectionShare?: number;
  publisherRoleCode?: string;
}

export interface MlcWorkRecord {
  mlcSongCode: string;
  primaryTitle: string;
  iswc: string | null;
  writers: MlcWorkWriter[];
  publishers: MlcWorkPublisher[];
  knownSharesPct: number;
}

const MLC_API_BASE = "https://public-api.themlc.com";
const BATCH_SIZE = 10;
const RECORDINGS_SEARCH_DELAY_MS = 220;

function normalizeIsrcKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function mlcWorksApiAvailable(): boolean {
  return Boolean(process.env.MLC_API_KEY?.trim() && process.env.MLC_PASSWORD?.trim());
}

async function getIdToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const username = process.env.MLC_API_KEY?.trim();
  const password = process.env.MLC_PASSWORD?.trim();
  if (!username || !password) {
    throw new Error("MLC_API_KEY és MLC_PASSWORD szükséges az MLC works API-hoz.");
  }

  const res = await fetch(`${MLC_API_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 280);
    throw new Error(`MLC oauth/token failed: ${res.status} ${snippet}`);
  }
  const auth = (await res.json()) as { idToken?: string };
  const token = auth.idToken?.trim();
  if (!token) throw new Error("MLC auth: nincs idToken a válaszban.");

  cachedToken = { value: token, expiresAt: now + 50 * 60 * 1000 };
  return token;
}

function knownSharesPct(work: Record<string, unknown>): number {
  const publishers = (work.publishers as MlcWorkPublisher[] | undefined) ?? [];
  return Math.round(
    publishers.reduce((sum, p) => sum + Number(p.collectionShare ?? 0), 0) * 100,
  ) / 100;
}

function mapWork(raw: Record<string, unknown>): MlcWorkRecord | null {
  const code = String(raw.mlcSongCode ?? "").trim();
  if (!code) return null;
  return {
    mlcSongCode: code,
    primaryTitle: String(raw.primaryTitle ?? "").trim(),
    iswc: String(raw.iswc ?? "").trim() || null,
    writers: ((raw.writers as MlcWorkWriter[] | undefined) ?? []).filter(Boolean),
    publishers: ((raw.publishers as MlcWorkPublisher[] | undefined) ?? []).filter(Boolean),
    knownSharesPct: knownSharesPct(raw),
  };
}

function mapRecording(raw: Record<string, unknown>): MlcRecordingHit | null {
  const code = String(raw.mlcsongCode ?? raw.mlcSongCode ?? "").trim();
  if (!code) return null;
  const isrc = String(raw.isrc ?? "").trim();
  return {
    id: String(raw.id ?? "").trim() || `${code}:${isrc}`,
    title: String(raw.title ?? "").trim(),
    artist: String(raw.artist ?? "").trim(),
    isrc,
    mlcSongCode: code,
    labels: String(raw.labels ?? "").trim() || undefined,
  };
}

/** POST /search/recordings — single SearchRecording object (not array). */
export async function searchMlcRecordings(
  query: MlcRecordingSearchQuery,
): Promise<MlcRecordingHit[]> {
  if (!mlcWorksApiAvailable()) return [];

  const body: Record<string, string> = {};
  if (query.isrc?.trim()) body.isrc = normalizeIsrcKey(query.isrc);
  if (query.title?.trim()) body.title = query.title.trim();
  if (query.artist?.trim()) body.artist = query.artist.trim();
  if (Object.keys(body).length === 0) return [];

  const timeoutMs = Number(process.env.MLC_RECORDINGS_SEARCH_TIMEOUT_MS ?? "30000");
  const token = await getIdToken();

  const res = await fetch(`${MLC_API_BASE}/search/recordings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 204) return [];
  if (!res.ok) return [];

  const text = await res.text();
  if (!text.trim()) return [];
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => mapRecording(row as Record<string, unknown>))
    .filter((row): row is MlcRecordingHit => row !== null);
}

function normalizeTitleKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function titleMatchScore(recordingTitle: string, targetTitle?: string | null): number {
  const a = normalizeTitleKey(recordingTitle);
  const b = normalizeTitleKey(targetTitle ?? "");
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 75;
  const aWords = a.split(" ").filter((w) => w.length > 2);
  const bWords = new Set(b.split(" ").filter((w) => w.length > 2));
  const overlap = aWords.filter((w) => bWords.has(w)).length;
  if (overlap >= 2) return 50 + overlap * 5;
  return 0;
}

export function pickBestMlcRecording(
  hits: MlcRecordingHit[],
  targetIsrc: string,
  rowArtist?: string | null,
  rowTitle?: string | null,
  altTitle?: string | null,
): MlcRecordingHit | undefined {
  if (hits.length === 0) return undefined;

  const key = normalizeIsrcKey(targetIsrc);
  const exact = hits.find((h) => normalizeIsrcKey(h.isrc) === key);
  if (exact) return exact;

  const artistUp = rowArtist?.trim().toUpperCase();
  let candidates = hits;
  if (artistUp) {
    const byArtist = hits.filter((h) => h.artist.toUpperCase().includes(artistUp));
    if (byArtist.length > 0) candidates = byArtist;
  }

  const titles = [rowTitle, altTitle]
    .map((t) => t?.trim())
    .filter((t): t is string => Boolean(t));
  if (titles.length > 0) {
    const scored = candidates
      .map((hit) => ({
        hit,
        score: Math.max(...titles.map((t) => titleMatchScore(hit.title, t))),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored.length > 0) return scored[0].hit;
  }

  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Resolve MLC recording → song code for audit rows (skips ISRCs already covered). */
export async function resolveMlcRecordingsForRows(
  rows: Array<{
    isrc: string;
    title?: string | null;
    artist?: string | null;
    searchTitle?: string | null;
    searchArtist?: string | null;
    searchParentTitle?: string | null;
  }>,
  skipIsrcKeys?: Set<string>,
): Promise<Map<string, MlcRecordingHit>> {
  const out = new Map<string, MlcRecordingHit>();
  if (!mlcWorksApiAvailable()) return out;

  const delayMs =
    Number.parseInt(process.env.MLC_RECORDINGS_SEARCH_DELAY_MS ?? String(RECORDINGS_SEARCH_DELAY_MS), 10) ||
    RECORDINGS_SEARCH_DELAY_MS;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const key = normalizeIsrcKey(row.isrc);
    if (!key || skipIsrcKeys?.has(key) || out.has(key)) continue;

    const listTitle = row.title?.trim();
    const listArtist = row.artist?.trim();
    const spotifyTitle = row.searchTitle?.trim();
    const spotifyArtist = row.searchArtist?.trim();
    const pickArtist = listArtist || spotifyArtist;
    let picked: MlcRecordingHit | undefined;

    const titleArtistQueries: Array<{ title: string; artist: string }> = [];
    const seenQuery = new Set<string>();
    const addQuery = (title?: string | null, artist?: string | null) => {
      const t = title?.trim();
      const a = artist?.trim();
      if (!t || !a) return;
      const sig = `${t.toUpperCase()}|${a.toUpperCase()}`;
      if (seenQuery.has(sig)) return;
      seenQuery.add(sig);
      titleArtistQueries.push({ title: t, artist: a });
    };

    addQuery(spotifyTitle, spotifyArtist);
    addQuery(listTitle, listArtist);
    addQuery(row.searchParentTitle, listArtist || spotifyArtist);
    addQuery(row.searchParentTitle, spotifyArtist);

    for (const q of titleArtistQueries) {
      const hits = await searchMlcRecordings(q);
      picked = pickBestMlcRecording(
        hits,
        row.isrc,
        pickArtist,
        listTitle,
        spotifyTitle,
      );
      if (picked) break;
    }

    if (!picked) {
      const hits = await searchMlcRecordings({ isrc: row.isrc });
      picked = pickBestMlcRecording(hits, row.isrc, pickArtist, listTitle, spotifyTitle);
    }

    if (picked) out.set(key, picked);

    if (i < rows.length - 1) await delay(delayMs);
  }

  return out;
}

export async function fetchMlcWorksBySongCodes(
  songCodes: string[],
): Promise<Map<string, MlcWorkRecord>> {
  const unique = [...new Set(songCodes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
  const out = new Map<string, MlcWorkRecord>();
  if (unique.length === 0) return out;

  const token = await getIdToken();

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const res = await fetch(`${MLC_API_BASE}/works`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(chunk.map((mlcsongCode) => ({ mlcsongCode }))),
    });
    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 280);
      throw new Error(`MLC works failed: ${res.status} ${snippet}`);
    }
    const works = (await res.json()) as Record<string, unknown>[];
    for (const raw of works) {
      const mapped = mapWork(raw);
      if (mapped) out.set(mapped.mlcSongCode.toUpperCase(), mapped);
    }
  }

  return out;
}

export function mlcWorkToSongwriters(work: MlcWorkRecord): Array<{ name: string; ipi: string | null; role: string }> {
  return work.writers
    .map((w) => {
      const name = `${w.writerFirstName ?? ""} ${w.writerLastName ?? ""}`.trim();
      const ipi = w.writerIPI?.trim() || null;
      if (!name && !ipi) return null;
      return { name: name || ipi || "", ipi, role: "Writer" };
    })
    .filter((w): w is { name: string; ipi: string | null; role: string } => w !== null);
}

export interface MlcWriterSearchInput {
  writerFirstName?: string;
  writerLastName?: string;
  writerIPI?: string;
}

export interface MlcWorkSearchHit {
  mlcSongCode: string;
  workTitle: string;
  iswc: string | null;
  writers: MlcWorkWriter[];
}

function mapWorkSearchHit(raw: Record<string, unknown>): MlcWorkSearchHit | null {
  const code = String(raw.mlcSongCode ?? "").trim();
  const title = String(raw.workTitle ?? "").trim();
  if (!code || !title) return null;
  return {
    mlcSongCode: code,
    workTitle: title,
    iswc: String(raw.iswc ?? "").trim() || null,
    writers: ((raw.writers as MlcWorkWriter[] | undefined) ?? []).filter(Boolean),
  };
}

/** POST /search/songcode — work search by title + writer (MLC portal Writer tab equivalent). */
export async function searchMlcWorksByTitleAndWriter(
  title: string,
  writer: MlcWriterSearchInput,
): Promise<MlcWorkSearchHit[]> {
  if (!mlcWorksApiAvailable()) return [];

  const workTitle = title.trim();
  const writerFirstName = writer.writerFirstName?.trim();
  const writerLastName = writer.writerLastName?.trim();
  const writerIPI = writer.writerIPI?.trim();
  if (!workTitle || (!writerFirstName && !writerLastName && !writerIPI)) return [];

  const writers: Record<string, string> = {};
  if (writerFirstName) writers.writerFirstName = writerFirstName;
  if (writerLastName) writers.writerLastName = writerLastName;
  if (writerIPI) writers.writerIPI = writerIPI;

  const timeoutMs = Number(process.env.MLC_WORK_SEARCH_TIMEOUT_MS ?? "30000");
  const token = await getIdToken();

  const res = await fetch(`${MLC_API_BASE}/search/songcode`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title: workTitle, writers: [writers] }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 204) return [];
  if (!res.ok) return [];

  const text = await res.text();
  if (!text.trim()) return [];
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((row) => mapWorkSearchHit(row as Record<string, unknown>))
    .filter((row): row is MlcWorkSearchHit => row !== null);
}

function normalizeWriterToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** HU family-given and western given-family variants for MLC writer search. */
export function mlcWriterNameVariants(name: string): MlcWriterSearchInput[] {
  const parts = normalizeWriterToken(name).split(" ").filter(Boolean);
  if (parts.length < 2) return [];

  const variants: MlcWriterSearchInput[] = [];
  const seen = new Set<string>();

  const add = (first: string, last: string) => {
    const key = `${first}|${last}`;
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({ writerFirstName: first, writerLastName: last });
  };

  // HU: Balázs Ádám → ADAM BALAZS (portal order)
  add(parts[1], parts[0]);
  // Western swap
  add(parts[0], parts[1]);
  if (parts.length >= 3) {
    add(parts.slice(1).join(" "), parts[0]);
    add(parts[0], parts.slice(1).join(" "));
  }

  return variants;
}

export function pickBestMlcWorkSearchHit(
  hits: MlcWorkSearchHit[],
  targetTitle: string,
  writerIpi?: string | null,
): MlcWorkSearchHit | undefined {
  if (hits.length === 0) return undefined;

  const ipi = writerIpi?.replace(/\D/g, "").padStart(11, "0").slice(-11);
  let candidates = hits;
  if (ipi) {
    const byIpi = hits.filter((hit) =>
      hit.writers.some((w) => {
        const wIpi = (w.writerIPI ?? "").replace(/\D/g, "").padStart(11, "0").slice(-11);
        return wIpi === ipi;
      }),
    );
    if (byIpi.length > 0) candidates = byIpi;
  }

  const scored = candidates
    .map((hit) => ({ hit, score: titleMatchScore(hit.workTitle, targetTitle) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) return scored[0].hit;
  return candidates.length === 1 ? candidates[0] : undefined;
}

export async function searchMlcWriterWorksForTitles(
  titles: string[],
  options: {
    legalName?: string | null;
    artistName?: string | null;
    writerIpi?: string | null;
    maxLookups?: number;
    delayMs?: number;
  },
): Promise<{ hitsByTitle: Map<string, MlcWorkSearchHit>; lookups: number }> {
  const hitsByTitle = new Map<string, MlcWorkSearchHit>();
  if (!mlcWorksApiAvailable()) return { hitsByTitle, lookups: 0 };

  const maxLookups =
    options.maxLookups ??
    (Number.parseInt(process.env.MLC_WRITER_SEARCH_MAX ?? "40", 10) || 40);
  const delayMs =
    options.delayMs ??
    (Number.parseInt(process.env.MLC_WRITER_SEARCH_DELAY_MS ?? "220", 10) || 220);

  const writerVariants: MlcWriterSearchInput[] = [];
  const seenWriter = new Set<string>();
  const addWriter = (w: MlcWriterSearchInput) => {
    const key = `${w.writerFirstName ?? ""}|${w.writerLastName ?? ""}|${w.writerIPI ?? ""}`;
    if (seenWriter.has(key)) return;
    seenWriter.add(key);
    writerVariants.push(w);
  };

  const ipi = options.writerIpi?.trim();
  if (ipi) addWriter({ writerIPI: ipi });

  for (const name of [options.legalName, options.artistName]) {
    const trimmed = name?.trim();
    if (!trimmed) continue;
    for (const variant of mlcWriterNameVariants(trimmed)) {
      addWriter(ipi ? { ...variant, writerIPI: ipi } : variant);
      addWriter(variant);
    }
  }

  if (writerVariants.length === 0) return { hitsByTitle, lookups: 0 };

  const uniqueTitles = [...new Set(titles.map((t) => t.trim()).filter(Boolean))];
  let lookups = 0;

  for (const title of uniqueTitles) {
    if (lookups >= maxLookups) break;
    if (hitsByTitle.has(title)) continue;

    for (const writer of writerVariants) {
      if (lookups >= maxLookups) break;
      lookups += 1;
      const hits = await searchMlcWorksByTitleAndWriter(title, writer);
      const picked = pickBestMlcWorkSearchHit(hits, title, ipi);
      if (picked) {
        hitsByTitle.set(title, picked);
        break;
      }
      if (lookups < maxLookups) await delay(delayMs);
    }
  }

  return { hitsByTitle, lookups };
}
