import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CmoWebSearchResult, CmoWebSourceId } from "@/lib/cmo-web/web-types";
import { isServerlessRuntime } from "@/lib/runtime-env";

function cacheRoot(source: CmoWebSourceId): string {
  const base = isServerlessRuntime()
    ? path.join("/tmp", "cmo-web-cache")
    : path.join(process.cwd(), "derived", "cmo-web-cache");
  return path.join(base, source);
}

function cachePath(source: CmoWebSourceId, query: string): string {
  const hash = createHash("sha256").update(query.toLowerCase()).digest("hex").slice(0, 16);
  return path.join(cacheRoot(source), `${hash}.json`);
}

export async function readCmoWebCache(
  source: CmoWebSourceId,
  query: string,
  maxAgeMs: number,
): Promise<CmoWebSearchResult | null> {
  try {
    const raw = await readFile(cachePath(source, query), "utf8");
    const parsed = JSON.parse(raw) as CmoWebSearchResult;
    const age = Date.now() - Date.parse(parsed.fetchedAt);
    if (!Number.isFinite(age) || age > maxAgeMs) return null;
    return { ...parsed, fromCache: true };
  } catch {
    return null;
  }
}

export async function writeCmoWebCache(result: CmoWebSearchResult): Promise<void> {
  try {
    const dir = cacheRoot(result.source);
    await mkdir(dir, { recursive: true });
    await writeFile(cachePath(result.source, result.query), JSON.stringify(result, null, 2), "utf8");
  } catch {
    // best-effort
  }
}
