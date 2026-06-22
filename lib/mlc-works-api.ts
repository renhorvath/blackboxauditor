/** MLC public API — musical work lookup by song code (themlc.com registry). */

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
