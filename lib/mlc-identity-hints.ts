import type { IdentityProposals, IdentityVoteCandidate } from "@/lib/audit-core/artist-context-types";
import {
  mlcWriterNameVariants,
  mlcWorksApiAvailable,
  searchMlcWorksByTitleAndWriter,
  type MlcWriterSearchInput,
} from "@/lib/mlc-works-api";

function normalizeIpi(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value.trim();
  return digits.padStart(11, "0").slice(-11);
}

function normalizeWriterToken(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function writerVariantKeys(names: string[]): Set<string> {
  const keys = new Set<string>();
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    keys.add(normalizeWriterToken(trimmed));
    for (const variant of mlcWriterNameVariants(trimmed)) {
      const first = variant.writerFirstName?.trim().toUpperCase() ?? "";
      const last = variant.writerLastName?.trim().toUpperCase() ?? "";
      if (first || last) keys.add(`${first} ${last}`.trim());
    }
  }
  return keys;
}

function writerMatchesTargets(
  writer: { writerFirstName?: string; writerLastName?: string },
  targets: Set<string>,
): boolean {
  const name = normalizeWriterToken(
    `${writer.writerFirstName ?? ""} ${writer.writerLastName ?? ""}`,
  );
  return targets.has(name);
}

function bump(
  map: Map<string, IdentityVoteCandidate>,
  value: string,
  source: string,
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const key = trimmed.toUpperCase();
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { value: trimmed, votes: 1, sources: [source] });
    return;
  }
  existing.votes += 1;
  if (!existing.sources.includes(source)) existing.sources.push(source);
}

export interface MlcWriterDiscovery {
  ipis: IdentityVoteCandidate[];
  legalNames: IdentityVoteCandidate[];
  topIpi: string | null;
  topLegalName: string | null;
}

/** MLC Public Search writer probe — title + writer name (portal Writer tab). */
export async function discoverMlcWriterIdentity(
  names: string[],
): Promise<MlcWriterDiscovery> {
  const ipiMap = new Map<string, IdentityVoteCandidate>();
  const legalMap = new Map<string, IdentityVoteCandidate>();
  if (!mlcWorksApiAvailable()) {
    return { ipis: [], legalNames: [], topIpi: null, topLegalName: null };
  }

  const targets = writerVariantKeys(names);
  const writerVariants: MlcWriterSearchInput[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    for (const variant of mlcWriterNameVariants(name)) {
      const key = `${variant.writerFirstName ?? ""}|${variant.writerLastName ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      writerVariants.push(variant);
    }
  }

  const maxProbes =
    Number.parseInt(process.env.MLC_DISCOVER_MAX_PROBES ?? "10", 10) || 10;
  const probeTitles = ["THE", "A"];
  let probes = 0;
  outer: for (const title of probeTitles) {
    for (const writer of writerVariants) {
      if (probes >= maxProbes) break outer;
      probes += 1;
      const hits = await searchMlcWorksByTitleAndWriter(title, writer);
      for (const hit of hits) {
        for (const w of hit.writers) {
          if (!writerMatchesTargets(w, targets)) continue;
          const name = `${w.writerFirstName ?? ""} ${w.writerLastName ?? ""}`.trim();
          if (name) bump(legalMap, name, "MLC writer");
          if (w.writerIPI?.trim()) bump(ipiMap, normalizeIpi(w.writerIPI), "MLC writer");
        }
      }
      if (ipiMap.size > 0) break outer;
    }
  }

  const ipis = [...ipiMap.values()].sort((a, b) => b.votes - a.votes);
  const legalNames = [...legalMap.values()].sort((a, b) => b.votes - a.votes);
  return {
    ipis,
    legalNames,
    topIpi: ipis[0]?.value ?? null,
    topLegalName: legalNames[0]?.value ?? null,
  };
}

function mergeCandidates(
  existing: IdentityVoteCandidate[],
  extra: IdentityVoteCandidate[],
): IdentityVoteCandidate[] {
  const map = new Map<string, IdentityVoteCandidate>();
  for (const c of existing) map.set(c.value.toUpperCase(), c);
  for (const c of extra) {
    const prev = map.get(c.value.toUpperCase());
    if (!prev) map.set(c.value.toUpperCase(), c);
    else {
      prev.votes += c.votes;
      for (const s of c.sources) if (!prev.sources.includes(s)) prev.sources.push(s);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.votes - a.votes || a.value.localeCompare(b.value, "hu", { sensitivity: "base" }),
  );
}

export async function supplementIdentityProposalsFromMlc(
  proposals: IdentityProposals,
  options?: { legalName?: string | null; ipi?: string | null },
): Promise<IdentityProposals> {
  if (proposals.ipis.length > 0 && proposals.legalNames.length > 0) return proposals;

  const names = [
    proposals.displayName,
    options?.legalName ?? "",
    options?.ipi ? "" : "",
    ...proposals.legalNames.map((c) => c.value),
  ].filter(Boolean);

  const discovered = await discoverMlcWriterIdentity(names);
  if (discovered.ipis.length === 0 && discovered.legalNames.length === 0) return proposals;

  return {
    ...proposals,
    legalNames: mergeCandidates(proposals.legalNames, discovered.legalNames),
    ipis: mergeCandidates(proposals.ipis, discovered.ipis),
  };
}
