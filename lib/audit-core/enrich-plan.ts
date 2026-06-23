import type { CatalogEnrichProfile } from "@/lib/audit-core/enrich-profile";

/** Staged enrich legs — one HTTP request each, no monolithic 5‑minute call. */
export type EnrichLegId = "local" | "spotify" | "isrc" | "cisac";

export interface EnrichLegPlan {
  /** Must finish before `catalogEnrichReady` — target &lt; 30s total. */
  blocking: EnrichLegId[];
  /** Best-effort after ready — failures do not block the audit UI. */
  background: EnrichLegId[];
}

export function planEnrichLegs(profile: CatalogEnrichProfile): EnrichLegPlan {
  if (profile === "composer") {
    return {
      blocking: ["local"],
      background: ["cisac"],
    };
  }

  if (profile === "hybrid") {
    return {
      blocking: ["local", "isrc"],
      background: ["cisac"],
    };
  }

  return {
    blocking: ["local", "isrc"],
    background: ["cisac"],
  };
}

export function enrichLegMaxDurationSec(leg: EnrichLegId): number {
  switch (leg) {
    case "local":
      return 15;
    case "spotify":
      return 60;
    case "isrc":
      return 120;
    case "cisac":
      return 180;
  }
}
