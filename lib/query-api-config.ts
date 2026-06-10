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

export function queryApiTimeoutMs(phase?: "core" | "mlc" | "full"): number {
  const configured = Number(process.env.QUERY_API_TIMEOUT_MS ?? 120_000);
  const n = Number.isFinite(configured) && configured > 0 ? configured : 120_000;
  if (isServerlessRuntime()) {
    if (phase === "mlc") return Math.min(n, 58_000);
    if (phase === "core") return Math.min(n, 45_000);
    return Math.min(n, 52_000);
  }
  return n;
}

function envFlag(name: string): boolean {
  return process.env[name]?.trim().toLowerCase() === "true";
}

/** Vercel: skip slow MLC unmatched (~845M rows). Unclaimed still runs. */
export function artistAuditSkipMlcUnmatched(): boolean {
  return envFlag("ARTIST_AUDIT_SKIP_MLC_UNMATCHED") || envFlag("ARTIST_AUDIT_SKIP_MLC");
}

/** Vercel: skip MLC unclaimed too (normally unnecessary — ~68M rows, fast). */
export function artistAuditSkipMlcUnclaimed(): boolean {
  return envFlag("ARTIST_AUDIT_SKIP_MLC_ALL");
}
