/** CISAC ISWCnet public API client (mirrors scripts/cisac/iswc_client.py). */

const PORTAL = "https://iswcnet.cisac.org";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface CisacInterestedParty {
  name?: string;
  nameNumber?: number;
  baseNumber?: string;
  role?: string;
}

export interface CisacWorkRecord {
  iswc: string;
  iswcStatus?: string;
  originalTitle?: string;
  otherTitles?: Array<string | { title?: string }>;
  interestedParties?: CisacInterestedParty[];
  works?: unknown[];
}

let cachedToken: { value: string; expiresAt: number } | null = null;
let cachedApiBase: string | null = null;

const CISAC_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
const CISAC_MAX_RETRIES = 3;

function clearCisacCache(): void {
  cachedToken = null;
}

function cisacRetryDelayMs(attempt: number): number {
  return attempt === 0 ? 2_000 : attempt === 1 ? 5_000 : 10_000;
}

function normalizeCisacNameNumber(ipiNameNumber: string | number): number {
  return Number.parseInt(String(ipiNameNumber).replace(/\D/g, "").replace(/^0+/, "") || "0", 10);
}

async function getApiBase(): Promise<string> {
  if (cachedApiBase) return cachedApiBase;
  const res = await fetch(`${PORTAL}/configuration/GetClientAppConfiguration`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`CISAC config failed: ${res.status}`);
  }
  const cfg = (await res.json()) as { iswcApiManagementUri?: string };
  const base = cfg.iswcApiManagementUri?.replace(/\/$/, "");
  if (!base) throw new Error("CISAC config: missing iswcApiManagementUri");
  cachedApiBase = base;
  return base;
}

async function getToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) return cachedToken.value;

  const url = `${PORTAL}/ReCaptcha/ValidateReCaptchaResponse?${new URLSearchParams({ responseToken: "x" })}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`CISAC token failed: ${res.status}`);
  }
  let body: unknown = await res.json();
  if (typeof body === "string") body = JSON.parse(body) as { token_id?: string };
  const token = (body as { token_id?: string }).token_id?.trim();
  if (!token) throw new Error("CISAC token: missing token_id");

  cachedToken = { value: token, expiresAt: now + 45 * 60 * 1000 };
  return token;
}

function authHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: PORTAL,
    Referer: `${PORTAL}/`,
    "User-Agent": UA,
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  };
}

async function cisacRequest<T>(
  method: string,
  path: string,
  options?: { params?: Record<string, string>; body?: unknown },
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < CISAC_MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, cisacRetryDelayMs(attempt - 1)));
      if (attempt === 1) clearCisacCache();
    }

    const [apiBase, token] = await Promise.all([getApiBase(), getToken()]);
    let url = `${apiBase}${path}`;
    if (options?.params) {
      url = `${url}?${new URLSearchParams(options.params)}`;
    }

    try {
      const res = await fetch(url, {
        method,
        headers: authHeaders(token),
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const snippet = (await res.text()).slice(0, 280);
        const err = new Error(`CISAC ${method} ${path} failed: ${res.status} ${snippet}`);
        if (CISAC_RETRYABLE_STATUSES.has(res.status) && attempt < CISAC_MAX_RETRIES - 1) {
          lastError = err;
          continue;
        }
        throw err;
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError" && attempt < CISAC_MAX_RETRIES - 1) {
        lastError = e;
        continue;
      }
      throw e;
    }
  }

  throw lastError ?? new Error(`CISAC ${method} ${path} failed after retries`);
}

function normalizeCisacRecords(
  result: CisacWorkRecord[] | CisacWorkRecord,
): CisacWorkRecord[] {
  return Array.isArray(result) ? result : [result];
}

async function searchCisacByIpiParty(
  nameNumber: number,
  lastName: string,
): Promise<CisacWorkRecord[]> {
  const result = await cisacRequest<CisacWorkRecord[] | CisacWorkRecord>(
    "POST",
    "/iswc/searchByTitleAndContributor",
    {
      body: {
        interestedParties: [
          { lastName, nameNumber, baseNumber: "", role: "C" },
        ],
      },
    },
  );
  return normalizeCisacRecords(result);
}

export async function searchCisacByIpi(
  ipiNameNumber: string | number,
  lastName = "",
): Promise<CisacWorkRecord[]> {
  const nameNumber = normalizeCisacNameNumber(ipiNameNumber);
  if (!nameNumber) return [];

  const trimmedLast = lastName.trim();

  // Large IPI catalogs: API is flaky with lastName filter — try bare IPI first.
  try {
    const bare = await searchCisacByIpiParty(nameNumber, "");
    if (bare.length > 0 || !trimmedLast) return bare;
  } catch (err) {
    if (!trimmedLast) throw err;
    console.warn("[cisac] IPI catalog (no lastName) failed, retrying with lastName:", err);
  }

  if (trimmedLast) {
    return searchCisacByIpiParty(nameNumber, trimmedLast);
  }
  return [];
}

export async function searchCisacByIswc(iswc: string): Promise<CisacWorkRecord> {
  return cisacRequest<CisacWorkRecord>("GET", "/iswc/searchByIswc", {
    params: { iswc: iswc.trim() },
  });
}

export async function searchCisacByTitleAndContributor(
  title: string,
  lastName: string,
): Promise<CisacWorkRecord[]> {
  const result = await cisacRequest<CisacWorkRecord[] | CisacWorkRecord>(
    "POST",
    "/iswc/searchByTitleAndContributor",
    {
      body: {
        titles: [{ title: title.trim(), type: "OT" }],
        lastName: lastName.trim(),
      },
    },
  );
  return normalizeCisacRecords(result);
}
