/** Firecrawl scrape with optional page actions (JS-heavy CMO portals). */

export interface FirecrawlScrapeAction {
  type: "wait" | "click" | "write" | "press" | "scroll" | "scrape" | "executeJavascript";
  milliseconds?: number;
  selector?: string;
  text?: string;
  key?: string;
  script?: string;
}

export interface FirecrawlScrapeResult {
  html?: string;
  markdown?: string;
}

export async function scrapeViaFirecrawl(
  url: string,
  options?: {
    waitForMs?: number;
    formats?: ("html" | "markdown")[];
    actions?: FirecrawlScrapeAction[];
  },
): Promise<FirecrawlScrapeResult> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) {
    throw new Error("FIRECRAWL_API_KEY not configured");
  }

  const formats = options?.formats ?? ["markdown"];
  const body: Record<string, unknown> = {
    url,
    formats,
    waitFor: options?.waitForMs ?? 6000,
  };
  if (options?.actions?.length) {
    body.actions = options.actions;
  }

  const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 400);
    throw new Error(`Firecrawl ${res.status}: ${detail}`);
  }

  const payload = (await res.json()) as {
    success?: boolean;
    data?: { html?: string; markdown?: string };
    error?: string;
  };

  const data = payload.data;
  if (!data?.html && !data?.markdown) {
    throw new Error(payload.error ?? "Firecrawl returned no content");
  }
  return data;
}
