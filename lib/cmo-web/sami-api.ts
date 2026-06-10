const SAMI_API_URL =
  "https://minasidor.sami.se/api/incompleterecordings/GetAllIncompleteRecordings";

export interface SamiIncompleteRecording {
  id: string;
  name: string;
  year: number;
  country: string;
  isrc: string;
  label: string;
  mainArtist: string;
}

interface SamiApiEnvelope {
  StatusCode: number;
  Content: SamiIncompleteRecording[];
}

let cachedSamiList: { fetchedAt: number; rows: SamiIncompleteRecording[] } | null = null;
const SAMI_LIST_TTL_MS = 24 * 60 * 60 * 1000;

/** Public SAMI incomplete-recordings list (no auth). Response is JSON string inside JSON. */
export async function fetchSamiIncompleteRecordings(): Promise<SamiIncompleteRecording[]> {
  if (cachedSamiList && Date.now() - cachedSamiList.fetchedAt < SAMI_LIST_TTL_MS) {
    return cachedSamiList.rows;
  }

  const res = await fetch(SAMI_API_URL, {
    headers: {
      "User-Agent": "BlackboxAuditor/1.0 (+research; CMO Art.13 lookup)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new Error(`SAMI API HTTP ${res.status}`);
  }

  const outer = (await res.json()) as string | SamiApiEnvelope;
  const payload: SamiApiEnvelope =
    typeof outer === "string" ? (JSON.parse(outer) as SamiApiEnvelope) : outer;

  if (!Array.isArray(payload.Content)) {
    throw new Error("SAMI API returned unexpected payload");
  }
  cachedSamiList = { fetchedAt: Date.now(), rows: payload.Content };
  return payload.Content;
}
