import type { CmoWebSearchResult, CmoWebSourceId } from "@/lib/cmo-web/web-types";

const PENDING: Record<CmoWebSourceId, string> = {
  zaiks: "",
  sacem: "",
  spedidam: "",
  sami: "",
  koda: "",
  prs: "PRS PDF value-band lists — use scripts/cmo/pending/ and monthly manual refresh.",
  sgae: "SGAE PDF registry — parser not implemented; see scripts/cmo/pending/.",
  buma: "BUMA/Stemra Airplayclaim — members-only web; stub only.",
};

/** Phase-4 sources: return empty until explicitly enabled and a fetch path exists. */
export function searchPendingCmoWeb(
  source: CmoWebSourceId,
  query: string,
): Promise<CmoWebSearchResult> {
  return Promise.resolve({
    source,
    query: query.trim(),
    hits: [],
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    error: PENDING[source] || "Not implemented",
  });
}
