import { fetchHtmlViaFirecrawl } from "@/lib/cmo-web/firecrawl-fetch";

const UA = "BlackboxAuditor/1.0 (+research; CMO Art.13 lookup)";

async function fetchTextDirect(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/json,*/*",
      ...(init?.headers ?? {}),
    },
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

/** CMO web portals — prefers Firecrawl when FIRECRAWL_API_KEY is set (JS-rendered tables). */
export async function fetchCmoWebHtml(
  url: string,
  options?: { waitForMs?: number },
): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (key) {
    try {
      return await fetchHtmlViaFirecrawl(url, options?.waitForMs ?? 6000);
    } catch (err) {
      console.warn("[cmo-web] Firecrawl scrape failed, trying direct fetch:", err);
    }
  }
  return fetchTextDirect(url);
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  return fetchTextDirect(url, init);
}
