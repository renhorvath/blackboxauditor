import type { BatchResult, ShareAuditResult, UnmatchedAuditResult } from "@/lib/types";

const BATCH_SIZE = 100;
const DELAY_BETWEEN_BATCHES_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function normalizeIsrcKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/-/g, "");
}

/** Normalize ISWC for matching dashed vs compact keys (T-007254756-8 vs T0072547568). */
function normalizeIswcKey(raw: string): string {
  return raw.replace(/-/g, "").toUpperCase();
}

function creditsHeaders(): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = process.env.CREDITS_FM_API_KEY?.trim();
  if (key) {
    headers["x-api-key"] = key;
    if (!key.startsWith("cfm_")) {
      headers.Authorization = `Bearer ${key}`;
    }
  }
  return headers;
}

function baseUrl(): string {
  return (process.env.CREDITS_FM_BASE_URL ?? "https://api.credits.fm/v1").replace(/\/$/, "");
}

/** Same-origin legacy JSON (camelCase) — often richer songwriter rows than canonical /v1/batch. */
function legacyCreditsSiteOrigin(): string {
  return (process.env.CREDITS_FM_LEGACY_ORIGIN ?? "https://credits.fm").replace(/\/$/, "");
}

function legacyWebsiteFallbackEnabled(): boolean {
  const v = process.env.CREDITS_FM_LEGACY_FALLBACK?.trim().toLowerCase();
  return v !== "false" && v !== "0";
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, init);
    lastRes = res;
    if (res.status === 429) {
      await delay(2000 * (attempt + 1));
      continue;
    }
    return res;
  }
  return lastRes!;
}

type SongwriterShape = {
  ipi?: string;
  name?: string;
  role?: string;
  credit_type?: string;
  share_percentage?: number | null;
  publishers?: Array<{ ipi?: string; name?: string; role?: string }>;
};

/** Raw recording entry from POST /v1/batch (`isrcs` map values). Snake_case per API. */
interface CreditsFmBatchIsrcEntry {
  credits_id?: string;
  isrc?: string;
  recording_title?: string | null;
  song_title?: string | null;
  artist_names?: string[];
  iswc?: string | null;
  match_status?: string;
  sources?: string[];
  missing_fields?: string[];
  songwriters?: SongwriterShape[];
  performers?: unknown[];
  mlc_song_code?: string | null;
  mlc_portal_url?: string | null;
}

/** Work row from POST /v1/batch (`iswcs` map). */
interface CreditsFmBatchIswcEntry {
  iswc?: string;
  song_title?: string | null;
  songwriter_names?: string[];
  songwriters?: SongwriterShape[];
  writers?: SongwriterShape[];
}

interface CreditsFmBatchResponse {
  isrcs?: Record<string, CreditsFmBatchIsrcEntry | undefined>;
  iswcs?: Record<string, CreditsFmBatchIswcEntry | undefined>;
}

function lookupIsrcRaw(
  requestedIsrc: string,
  map: Record<string, CreditsFmBatchIsrcEntry | undefined> | undefined,
): CreditsFmBatchIsrcEntry | undefined {
  if (!map) return undefined;
  const n = normalizeIsrcKey(requestedIsrc);
  const direct =
    map[requestedIsrc] ?? map[n] ?? map[requestedIsrc.trim()] ?? map[requestedIsrc.toUpperCase()];
  if (direct) return direct;
  for (const [key, val] of Object.entries(map)) {
    if (val && normalizeIsrcKey(key) === n) return val;
  }
  return undefined;
}

function lookupIswcRaw(
  iswc: string,
  map: Record<string, CreditsFmBatchIswcEntry | undefined> | undefined,
): CreditsFmBatchIswcEntry | undefined {
  if (!map || !iswc) return undefined;
  const n = normalizeIswcKey(iswc);
  const direct = map[iswc] ?? map[iswc.trim()];
  if (direct) return direct;
  for (const [key, val] of Object.entries(map)) {
    if (val && normalizeIswcKey(key) === n) return val;
  }
  return undefined;
}

function dedupeSongwriters(list: SongwriterShape[]): SongwriterShape[] {
  const seen = new Set<string>();
  const out: SongwriterShape[] = [];
  for (const sw of list) {
    const name = (sw.name ?? "").trim().toUpperCase();
    const ip = (sw.ipi ?? "").trim();
    const key = `${ip}|${name}`;
    if (!name && !ip) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sw);
  }
  return out;
}

/** Attach composers from POST /v1/batch `iswcs` map when ISRC-level songwriters are empty. */
function mergeWorkBatchIntoResults(
  results: BatchResult[],
  workPayload: CreditsFmBatchResponse,
): void {
  for (const r of results) {
    if (!r.found || !r.data?.iswc) continue;
    const swCount = r.data.songwriters?.length ?? 0;
    if (swCount > 0) continue;

    const work = lookupIswcRaw(r.data.iswc, workPayload.iswcs);
    if (!work) continue;

    const fromObjs = [...(work.songwriters ?? []), ...(work.writers ?? [])];
    const fromNames = (work.songwriter_names ?? [])
      .map((n) => n.trim())
      .filter(Boolean)
      .map((name) => ({ name, role: "Composer" } as SongwriterShape));

    const merged = dedupeSongwriters([...fromObjs, ...fromNames]);
    if (merged.length === 0) continue;

    r.data.songwriters = merged;
    const extraPubs = merged.flatMap((s) => s.publishers ?? []);
    r.data.publishers = [...((r.data.publishers ?? []) as unknown[]), ...extraPubs];
  }
}

function collectSongwritersFromGraphJson(root: unknown, maxDepth = 12): SongwriterShape[] {
  const out: SongwriterShape[] = [];
  const seenObjs = new WeakSet<object>();

  function isPerformerOnly(o: SongwriterShape): boolean {
    const role = (o.role ?? o.credit_type ?? "").toLowerCase();
    return role === "performer" && !o.ipi;
  }

  function walk(node: unknown, depth: number): void {
    if (depth > maxDepth || node == null) return;
    if (typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }

    if (seenObjs.has(node)) return;
    seenObjs.add(node);

    const o = node as Record<string, unknown>;
    for (const key of ["songwriters", "writers"]) {
      const arr = o[key];
      if (!Array.isArray(arr)) continue;
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const row = item as SongwriterShape;
        const name = (row.name ?? "").trim();
        if (!name && !row.ipi) continue;
        if (isPerformerOnly(row)) continue;
        out.push(row);
      }
    }

    for (const v of Object.values(o)) walk(v, depth + 1);
  }

  walk(root, 0);
  return dedupeSongwriters(out);
}

async function fetchJsonTimed(url: string, timeoutMs: number): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: creditsHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Optional slow path — docs: GET /v1/isrc/{isrc}?graph=1 … May timeout on heavy graphs. */
async function graphHydrateResults(results: BatchResult[]): Promise<void> {
  const timeoutMs = Number(process.env.CREDITS_FM_GRAPH_TIMEOUT_MS ?? "14000");
  for (const r of results) {
    if (!r.found || !r.data?.isrc) continue;
    if ((r.data.songwriters?.length ?? 0) > 0) continue;

    const isrcEnc = encodeURIComponent(r.data.isrc);
    let json = await fetchJsonTimed(
      `${baseUrl()}/isrc/${isrcEnc}?graph=1&depth=3&limit=40`,
      timeoutMs,
    );
    let extra = json ? collectSongwritersFromGraphJson(json) : [];

    if (extra.length === 0 && r.data.iswc) {
      const iswcEnc = encodeURIComponent(r.data.iswc);
      json = await fetchJsonTimed(
        `${baseUrl()}/iswc/${iswcEnc}?graph=1&include=all&depth=3&limit=40`,
        timeoutMs,
      );
      extra = json ? collectSongwritersFromGraphJson(json) : [];
    }

    if (extra.length === 0) continue;
    const merged = dedupeSongwriters(extra);
    r.data.songwriters = merged;
    const extraPubs = merged.flatMap((s) => s.publishers ?? []);
    r.data.publishers = [...((r.data.publishers ?? []) as unknown[]), ...extraPubs];

    await delay(350);
  }
}

async function batchPost(body: Record<string, unknown>): Promise<CreditsFmBatchResponse> {
  const res = await fetchWithRetry(`${baseUrl()}/batch`, {
    method: "POST",
    headers: creditsHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const snippet = (await res.text()).slice(0, 280);
    throw new Error(`credits.fm batch failed: ${res.status} ${snippet}`);
  }
  return (await res.json()) as CreditsFmBatchResponse;
}

async function enrichWithIswcWorkBatch(chunkResults: BatchResult[]): Promise<void> {
  const iswcSet = new Set<string>();
  for (const r of chunkResults) {
    if (!r.found || !r.data?.iswc) continue;
    if ((r.data.songwriters?.length ?? 0) > 0) continue;
    iswcSet.add(r.data.iswc.trim());
  }

  const iswcs = [...iswcSet];
  if (iswcs.length === 0) return;

  const ic = chunkArray(iswcs, BATCH_SIZE);
  for (let j = 0; j < ic.length; j++) {
    const workData = await batchPost({ iswcs: ic[j], contribute: false });
    mergeWorkBatchIntoResults(chunkResults, workData);
    if (j < ic.length - 1) await delay(DELAY_BETWEEN_BATCHES_MS);
  }
}

/** Legacy GET https://credits.fm/api/isrc/{isrc} — songwriter arrays populated where v1 batch is sparse. */
interface LegacyIsrcCamelResponse {
  songwriters?: Array<{
    name?: string;
    ipi?: string | null;
    role?: string;
    sharePercentage?: number | string | null;
    publishers?: Array<{
      name?: string;
      ipi?: string | null;
      role?: string;
      sharePercentage?: number | string | null;
    }>;
  }>;
  sources?: string[];
  mlcSongCode?: string | null;
  mlcPortalUrl?: string | null;
}

function sharePct(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapLegacySongwriters(rows: LegacyIsrcCamelResponse["songwriters"]): SongwriterShape[] {
  if (!rows?.length) return [];
  const out: SongwriterShape[] = [];
  for (const sw of rows) {
    const name = (sw.name ?? "").trim();
    const ipi = sw.ipi?.trim() || undefined;
    if (!name && !ipi) continue;
    out.push({
      name: name || undefined,
      ipi,
      role: sw.role,
      share_percentage: sharePct(sw.sharePercentage),
      publishers: (sw.publishers ?? []).map((p) => ({
        name: (p.name ?? "").trim() || undefined,
        ipi: p.ipi?.trim() || undefined,
        role: p.role,
      })),
    });
  }
  return dedupeSongwriters(out);
}

async function enrichFromLegacyWebsiteApi(chunkResults: BatchResult[]): Promise<void> {
  if (!legacyWebsiteFallbackEnabled()) return;

  const timeoutMs = Number(process.env.CREDITS_FM_LEGACY_TIMEOUT_MS ?? "28000");
  const origin = legacyCreditsSiteOrigin();

  for (const r of chunkResults) {
    if (!r.found || !r.data?.isrc) continue;
    if ((r.data.songwriters?.length ?? 0) > 0) continue;

    const url = `${origin}/api/isrc/${encodeURIComponent(r.data.isrc)}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...Object.fromEntries(new Headers(creditsHeaders()).entries()),
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      if (!res.ok) continue;

      const json = (await res.json()) as LegacyIsrcCamelResponse;
      const mapped = mapLegacySongwriters(json.songwriters);
      if (mapped.length === 0) continue;

      r.data.songwriters = mapped;
      r.data.publishers = [
        ...((r.data.publishers ?? []) as unknown[]),
        ...mapped.flatMap((s) => s.publishers ?? []),
      ];

      if (json.sources?.length) {
        r.data.sources = [...new Set([...(r.data.sources ?? []), ...json.sources])];
      }

      if (json.mlcSongCode && (r.data.mlc_song_code == null || r.data.mlc_song_code === "")) {
        r.data.mlc_song_code = json.mlcSongCode;
      }
      if (json.mlcPortalUrl && (r.data.mlc_portal_url == null || r.data.mlc_portal_url === "")) {
        r.data.mlc_portal_url = json.mlcPortalUrl;
      }

      if (r.data.missing_fields?.includes("songwriters")) {
        r.data.missing_fields = r.data.missing_fields.filter((f) => f !== "songwriters");
      }
    } catch {
      /* timeout / parse — keep v1 snapshot */
    }

    await delay(250);
  }
}

function mapBatchEntry(requestedIsrc: string, payload: CreditsFmBatchResponse): BatchResult {
  const id = normalizeIsrcKey(requestedIsrc);
  const raw = lookupIsrcRaw(requestedIsrc, payload.isrcs);

  if (!raw) {
    return { id, type: "isrc", found: false };
  }

  const songwriters = dedupeSongwriters(raw.songwriters ?? []);
  const publishers = songwriters.flatMap((sw) => sw.publishers ?? []);

  return {
    id,
    type: "isrc",
    found: true,
    data: {
      isrc: raw.isrc ? normalizeIsrcKey(raw.isrc) : id,
      title: raw.recording_title ?? raw.song_title ?? undefined,
      artists: (raw.artist_names ?? []).map((name) => ({ name })),
      iswc: raw.iswc ?? null,
      songwriters,
      publishers,
      mlc_song_code: raw.mlc_song_code ?? null,
      mlc_portal_url: raw.mlc_portal_url ?? null,
      sources: raw.sources,
      missing_fields: raw.missing_fields,
      match_status: raw.match_status,
    },
  };
}

/** POST /v1/audit/shares row — uses `issue`, not `share_status`. */
interface CreditsFmShareRow {
  isrc: string;
  total_share_percentage?: number | null;
  share_gap?: number | null;
  issue?: string;
  songwriters?: unknown[];
}

function mapShareRow(row: CreditsFmShareRow): ShareAuditResult {
  const issueRaw = (row.issue ?? "missing").toLowerCase();
  const allowed = ["complete", "incomplete", "missing", "over_allocated"] as const;
  const share_status = allowed.includes(issueRaw as (typeof allowed)[number])
    ? (issueRaw as ShareAuditResult["share_status"])
    : "missing";

  return {
    isrc: normalizeIsrcKey(row.isrc),
    total_share:
      row.total_share_percentage === undefined || row.total_share_percentage === null
        ? null
        : row.total_share_percentage,
    share_status,
    songwriter_count: row.songwriters?.length,
    missing_share:
      row.share_gap === undefined || row.share_gap === null ? null : row.share_gap,
  };
}

/** POST /v1/audit/unmatched — may return match_status `not_in_db`. */
interface CreditsFmUnmatchedRow {
  isrc: string;
  match_status?: string;
}

function mapUnmatchedRow(row: CreditsFmUnmatchedRow): UnmatchedAuditResult {
  const ms = (row.match_status ?? "").toLowerCase();
  let match_status: UnmatchedAuditResult["match_status"];
  if (ms === "matched") match_status = "matched";
  else if (ms === "unmatched") match_status = "unmatched";
  else if (ms === "not_in_db" || ms === "not_in_mlc") match_status = "not_in_mlc";
  else match_status = "unmatched";

  return {
    isrc: normalizeIsrcKey(row.isrc),
    matched: ms === "matched",
    match_status,
  };
}

export async function fetchBatchResults(isrcs: string[]): Promise<BatchResult[]> {
  const chunks = chunkArray(isrcs, BATCH_SIZE);
  const results: BatchResult[] = [];
  const useGraph =
    process.env.CREDITS_FM_GRAPH_HYDRATE === "1" ||
    process.env.CREDITS_FM_GRAPH_HYDRATE === "true";

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const data = await batchPost({ isrcs: chunk, contribute: false });
    const chunkResults = chunk.map((id) => mapBatchEntry(id, data));

    await enrichWithIswcWorkBatch(chunkResults);

    await enrichFromLegacyWebsiteApi(chunkResults);

    if (useGraph) {
      await graphHydrateResults(chunkResults);
    }

    results.push(...chunkResults);
    if (i < chunks.length - 1) await delay(DELAY_BETWEEN_BATCHES_MS);
  }

  return results;
}

export async function fetchShareAudit(isrcs: string[]): Promise<ShareAuditResult[]> {
  const chunks = chunkArray(isrcs, BATCH_SIZE);
  const results: ShareAuditResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const res = await fetchWithRetry(`${baseUrl()}/audit/shares`, {
      method: "POST",
      headers: creditsHeaders(),
      body: JSON.stringify({ isrcs: chunk }),
    });
    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 280);
      throw new Error(`credits.fm audit/shares failed: ${res.status} ${snippet}`);
    }
    const data = (await res.json()) as { results?: CreditsFmShareRow[] };
    const mapped = new Map((data.results ?? []).map((r) => [normalizeIsrcKey(r.isrc), r]));
    results.push(
      ...chunk.map((id) => {
        const hit = mapped.get(normalizeIsrcKey(id));
        if (hit) return mapShareRow(hit);
        return {
          isrc: normalizeIsrcKey(id),
          total_share: null,
          share_status: "missing" as const,
          missing_share: null,
        };
      }),
    );
    if (i < chunks.length - 1) await delay(DELAY_BETWEEN_BATCHES_MS);
  }

  return results;
}

export async function fetchUnmatchedAudit(isrcs: string[]): Promise<UnmatchedAuditResult[]> {
  const chunks = chunkArray(isrcs, BATCH_SIZE);
  const results: UnmatchedAuditResult[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const res = await fetchWithRetry(`${baseUrl()}/audit/unmatched`, {
      method: "POST",
      headers: creditsHeaders(),
      body: JSON.stringify({ isrcs: chunk }),
    });
    if (!res.ok) {
      const snippet = (await res.text()).slice(0, 280);
      throw new Error(`credits.fm audit/unmatched failed: ${res.status} ${snippet}`);
    }
    const data = (await res.json()) as { results?: CreditsFmUnmatchedRow[] };
    const mapped = new Map((data.results ?? []).map((r) => [normalizeIsrcKey(r.isrc), r]));
    results.push(
      ...chunk.map((id) => {
        const hit = mapped.get(normalizeIsrcKey(id));
        if (hit) return mapUnmatchedRow(hit);
        return {
          isrc: normalizeIsrcKey(id),
          matched: false,
          match_status: "unmatched" as const,
        };
      }),
    );
    if (i < chunks.length - 1) await delay(DELAY_BETWEEN_BATCHES_MS);
  }

  return results;
}
