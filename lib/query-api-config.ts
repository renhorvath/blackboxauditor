import { isServerlessRuntime } from "@/lib/runtime-env";

export function queryApiBaseUrl(): string | null {
  const raw = process.env.QUERY_API_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

export function queryApiKey(): string | null {
  const key = process.env.QUERY_API_KEY?.trim();
  return key || null;
}

/**
 * Vercel (serverless) → remote API when QUERY_API_URL is set.
 * Data machine → local files by default; set QUERY_API_FORCE=true to test remote.
 */
export function shouldUseQueryApi(): boolean {
  const base = queryApiBaseUrl();
  if (!base) return false;
  if (isServerlessRuntime()) return true;
  return process.env.QUERY_API_FORCE?.trim().toLowerCase() === "true";
}

export function queryApiTimeoutMs(): number {
  const n = Number(process.env.QUERY_API_TIMEOUT_MS ?? 120_000);
  return Number.isFinite(n) && n > 0 ? n : 120_000;
}
