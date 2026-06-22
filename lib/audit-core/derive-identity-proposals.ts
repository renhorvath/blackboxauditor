import {
  artistNameMatchStrength,
  splitArtistNameSegments,
  type ArtistNameMatchStrength,
} from "@/lib/artist-name-match";
import { normalizeArtisjusText } from "@/lib/artisjus-normalize";
import type { IdentityProposals, IdentityVoteCandidate } from "@/lib/audit-core/artist-context-types";
import { artistSlug } from "@/lib/recovery-case/artist-slug";
import type { AuditRow } from "@/lib/types";

function normKey(value: string): string {
  return normalizeArtisjusText(value).replace(/\s+/g, " ").trim();
}

function normQueryKey(query: string): string {
  return normKey(query);
}

function isCollabArtistString(value: string): boolean {
  return /[,/&]| FEAT\.? | FEAT | VS\.? | X /i.test(value);
}

function isStrongMatch(strength: ArtistNameMatchStrength): boolean {
  return strength === "exact" || strength === "word";
}

function bump(
  map: Map<string, IdentityVoteCandidate>,
  value: string,
  source: string,
): void {
  const trimmed = value.trim();
  if (!trimmed) return;
  const key = normKey(trimmed);
  if (!key) return;
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { value: trimmed, votes: 1, sources: [source] });
    return;
  }
  existing.votes += 1;
  if (!existing.sources.includes(source)) existing.sources.push(source);
}

function sortedCandidates(map: Map<string, IdentityVoteCandidate>): IdentityVoteCandidate[] {
  return [...map.values()].sort(
    (a, b) => b.votes - a.votes || a.value.localeCompare(b.value, "hu", { sensitivity: "base" }),
  );
}

function rowMatchesQuery(query: string, row: AuditRow): boolean {
  const candidates: string[] = [];
  if (row.artist?.trim()) {
    candidates.push(row.artist.trim());
    candidates.push(...splitArtistNameSegments(row.artist));
  }
  for (const hit of row.ejiHits ?? []) {
    if (hit.mainArtist?.trim()) candidates.push(hit.mainArtist.trim());
    if (hit.name?.trim()) candidates.push(hit.name.trim());
  }
  return candidates.some((c) => artistNameMatchStrength(query, c) !== "none");
}

function artistFieldHasStrongQueryMatch(query: string, row: AuditRow): boolean {
  const artist = row.artist?.trim();
  if (!artist) return false;
  if (isStrongMatch(artistNameMatchStrength(query, artist))) return true;
  return splitArtistNameSegments(artist).some((seg) =>
    isStrongMatch(artistNameMatchStrength(query, seg)),
  );
}

function extractWritersFromRow(row: AuditRow): Array<{ name: string; ipi: string | null }> {
  const out: Array<{ name: string; ipi: string | null }> = [];
  const batch = row.rawBatchData as {
    data?: { songwriters?: unknown[] };
  };
  for (const item of batch?.data?.songwriters ?? []) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const ipi = String(o.ipi ?? "").trim() || null;
    if (name || ipi) out.push({ name: name || ipi || "", ipi });
  }
  for (const hit of row.cmoHits ?? []) {
    if (hit.composer?.trim()) out.push({ name: hit.composer.trim(), ipi: null });
    if (hit.performer?.trim()) out.push({ name: hit.performer.trim(), ipi: null });
  }
  return out;
}

function normalizeIpi(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return value.trim();
  return digits.padStart(11, "0").slice(-11);
}

export function deriveIdentityProposals(
  displayName: string,
  rows: AuditRow[],
): IdentityProposals {
  const queryKey = normQueryKey(displayName);
  const aliasMap = new Map<string, IdentityVoteCandidate>();
  const excludeMap = new Map<string, IdentityVoteCandidate>();
  const featMap = new Map<string, IdentityVoteCandidate>();
  const legalMap = new Map<string, IdentityVoteCandidate>();
  const ipiMap = new Map<string, IdentityVoteCandidate>();

  const matchedRows = rows.filter((row) => rowMatchesQuery(displayName, row));

  for (const row of matchedRows) {
    const artist = row.artist?.trim() ?? "";
    const segments = artist ? splitArtistNameSegments(artist) : [];
    const strongOnArtistField = artistFieldHasStrongQueryMatch(displayName, row);

    for (const seg of segments) {
      const strength = artistNameMatchStrength(displayName, seg);
      const segKey = normKey(seg);
      if (!segKey || segKey === queryKey) continue;

      if (isStrongMatch(strength)) {
        bump(aliasMap, seg, "artist_field");
        continue;
      }

      if (strongOnArtistField) {
        bump(featMap, seg, "feat_on_track");
        continue;
      }

      if (strength === "none" || strength === "substring") {
        bump(excludeMap, seg, "scope_candidate");
      }
    }

    if (
      artist &&
      !isCollabArtistString(artist) &&
      isStrongMatch(artistNameMatchStrength(displayName, artist)) &&
      normKey(artist) !== queryKey
    ) {
      bump(aliasMap, artist, "artist_field");
    }

    for (const writer of extractWritersFromRow(row)) {
      if (writer.name) bump(legalMap, writer.name, "credits.fm");
      if (writer.ipi) bump(ipiMap, normalizeIpi(writer.ipi), "credits.fm");
    }
  }

  return {
    slug: artistSlug(displayName),
    displayName,
    aliasCandidates: sortedCandidates(aliasMap),
    featCollaborators: sortedCandidates(featMap),
    excludeAliasCandidates: sortedCandidates(excludeMap),
    legalNames: sortedCandidates(legalMap),
    ipis: sortedCandidates(ipiMap),
  };
}
