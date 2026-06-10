import { CMO_WEB_SOURCE_IDS, type CmoWebSourceId } from "@/lib/cmo-web/web-types";

const DEFAULT_PHASE3: CmoWebSourceId[] = ["zaiks", "sacem", "spedidam", "sami", "koda"];

/** Comma-separated list in CMO_WEB_ENABLED; empty = phase-3 sources on. */
export function enabledCmoWebSources(): CmoWebSourceId[] {
  const raw = process.env.CMO_WEB_ENABLED?.trim();
  if (!raw) return [...DEFAULT_PHASE3];
  if (raw === "false" || raw === "0" || raw === "off") return [];
  const wanted = new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return CMO_WEB_SOURCE_IDS.filter((id) => wanted.has(id));
}
