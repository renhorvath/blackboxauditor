export interface SacemWorkHit {
  workTitle?: string;
  title?: string;
  parties?: string;
  interestedParties?: string;
  workCode?: string;
}

interface SacemSearchResponse {
  paginatedData?: SacemWorkHit[];
  pagination?: { totalElements?: number };
}

/** SACEM ONI JSON search (same endpoint the public SPA uses). */
export async function fetchSacemUnidentifiedWorks(
  query: string,
  options?: { page?: number; size?: number },
): Promise<SacemWorkHit[]> {
  const params = new URLSearchParams({
    parties: query,
    page: String(options?.page ?? 0),
    size: String(options?.size ?? 40),
    sortOrder: "ASC",
  });

  const res = await fetch(`https://repertoire.sacem.fr/en/unidentified-works?${params}`, {
    headers: {
      "User-Agent": "BlackboxAuditor/1.0 (+research; CMO Art.13 lookup)",
      "Content-Type": "application/json",
      Locale: "en",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`SACEM API HTTP ${res.status}`);
  }

  const payload = (await res.json()) as SacemSearchResponse;
  return payload.paginatedData ?? [];
}
