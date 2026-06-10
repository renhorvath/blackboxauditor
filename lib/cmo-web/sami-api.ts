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

/** Public SAMI incomplete-recordings list (no auth). Response is JSON string inside JSON. */
export async function fetchSamiIncompleteRecordings(): Promise<SamiIncompleteRecording[]> {
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
  return payload.Content;
}
