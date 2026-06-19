/** Ops UI: extra metadata blocks, catalog lens (see docs/ui_ab_roadmap.md). */

export function isOpsModeClient(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("ops") === "1") return true;
  } catch {
    /* ignore */
  }
  return process.env.NEXT_PUBLIC_OPS_UI?.trim().toLowerCase() === "true";
}
