import { isServerlessRuntime } from "@/lib/runtime-env";

/** Ops-only API routes: local data machine, or OPERATOR_SECRET on Vercel. */
export function isOpsApiAuthorized(req: Request): boolean {
  if (!isServerlessRuntime()) return true;
  const expected = process.env.OPERATOR_SECRET?.trim();
  if (!expected) return false;
  const provided = req.headers.get("x-operator-secret")?.trim();
  return provided === expected;
}
