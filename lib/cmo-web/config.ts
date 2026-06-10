import { CMO_WEB_SOURCE_IDS, type CmoWebSourceId } from "@/lib/cmo-web/web-types";

/** Reliable without Firecrawl / browser automation. */
const DEFAULT_ENABLED: CmoWebSourceId[] = ["spedidam", "sami"];
const FIRECRAWL_PHASE3: CmoWebSourceId[] = ["zaiks", "sacem", "koda"];

/** Comma-separated list in CMO_WEB_ENABLED; empty = SPEDIDAM + SAMI only. */
export function enabledCmoWebSources(): CmoWebSourceId[] {
  const raw = process.env.CMO_WEB_ENABLED?.trim();
  if (!raw) return [...DEFAULT_ENABLED];
  if (raw === "all" || raw === "phase3") {
    return [...DEFAULT_ENABLED, ...FIRECRAWL_PHASE3];
  }
  if (raw === "false" || raw === "0" || raw === "off") return [];
  const wanted = new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return CMO_WEB_SOURCE_IDS.filter((id) => wanted.has(id));
}

/** Web sources shown in „Hol kerestük” (always listed). */
export const CMO_WEB_COVERAGE_SOURCES: CmoWebSourceId[] = ["spedidam", "sami"];
