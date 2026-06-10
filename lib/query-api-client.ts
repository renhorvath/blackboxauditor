import type {
  ArtistAuditSourcesPayload,
  ArtistMlcPayload,
  QueryApiHealthResponse,
} from "@/lib/query-api-types";
import type { CmoWebSearchResult } from "@/lib/cmo-web/web-types";
import {
  artistAuditSkipMlcUnclaimed,
  artistAuditSkipMlcUnmatched,
  queryApiBaseUrl,
  queryApiKey,
  queryApiTimeoutMs,
} from "@/lib/query-api-config";

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const key = queryApiKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export class QueryApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QueryApiError";
  }
}

export async function fetchArtistSourcesFromQueryApi(
  artistName: string,
  options?: {
    forceRefresh?: boolean;
    /** core = ARTISJUS+CMO+EJI+web (no MLC); full = everything in one call */
    bundle?: boolean | "core" | "full";
    skipMlc?: boolean;
  },
): Promise<ArtistAuditSourcesPayload> {
  const base = queryApiBaseUrl();
  if (!base) {
    throw new QueryApiError("QUERY_API_URL is not configured");
  }

  const bundle = options?.bundle;
  const useCoreBundle = bundle === "core";
  const useFullBundle = bundle === true || bundle === "full";
  const phase = useCoreBundle ? "core" : useFullBundle ? "full" : undefined;

  const res = await fetch(`${base}/v1/artist/sources`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      artistName,
      forceRefresh: options?.forceRefresh ?? false,
      bundle: useCoreBundle ? "core" : useFullBundle ? true : false,
      skipMlcUnmatched: options?.skipMlc === true || artistAuditSkipMlcUnmatched(),
      skipMlcUnclaimed: options?.skipMlc === true || artistAuditSkipMlcUnclaimed(),
    }),
    signal: AbortSignal.timeout(queryApiTimeoutMs(phase)),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new QueryApiError(
      `Query API ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }

  return (await res.json()) as ArtistAuditSourcesPayload;
}

/** MLC-only scan — phase 2 of two-phase artist audit. */
export async function fetchArtistMlcFromQueryApi(
  artistName: string,
  options?: { forceRefresh?: boolean },
): Promise<ArtistMlcPayload> {
  const base = queryApiBaseUrl();
  if (!base) {
    throw new QueryApiError("QUERY_API_URL is not configured");
  }

  const res = await fetch(`${base}/v1/artist/mlc`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      artistName,
      forceRefresh: options?.forceRefresh ?? false,
    }),
    signal: AbortSignal.timeout(queryApiTimeoutMs("mlc")),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new QueryApiError(
      `Query API mlc ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }

  return (await res.json()) as ArtistMlcPayload;
}

/** CMO web adapters (SPEDIDAM, SAMI, …) — run on query host when Vercel cannot reach CMO APIs. */
export async function fetchCmoWebFromQueryApi(
  artistName: string,
  options?: { forceRefresh?: boolean },
): Promise<CmoWebSearchResult[]> {
  const base = queryApiBaseUrl();
  if (!base) {
    throw new QueryApiError("QUERY_API_URL is not configured");
  }

  const res = await fetch(`${base}/v1/cmo-web/search`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      artistName,
      forceRefresh: options?.forceRefresh ?? false,
    }),
    signal: AbortSignal.timeout(queryApiTimeoutMs()),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new QueryApiError(
      `Query API cmo-web ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status,
    );
  }

  const payload = (await res.json()) as { results?: CmoWebSearchResult[] };
  return payload.results ?? [];
}

export async function fetchQueryApiHealth(): Promise<QueryApiHealthResponse | null> {
  const base = queryApiBaseUrl();
  if (!base) return null;

  try {
    const res = await fetch(`${base}/health`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as QueryApiHealthResponse;
  } catch {
    return null;
  }
}
