import type {
  ArtistContext,
  IdentityProposals,
  IdentityStatus,
} from "@/lib/audit-core/artist-context-types";

const AMBIGUOUS_RATIO = 0.75;

function topTwoAmbiguous(candidates: { votes: number }[]): boolean {
  if (candidates.length < 2) return false;
  const [a, b] = candidates;
  if (a.votes === b.votes) return true;
  return b.votes >= a.votes * AMBIGUOUS_RATIO;
}

export function evaluateIdentityStatus(
  proposals: IdentityProposals,
  context: ArtistContext | null,
): IdentityStatus {
  if (context?.wizardCompletedAt) return "resolved";

  const hasScopeExclude = proposals.excludeAliasCandidates.length > 0;
  const ambiguousLegal = topTwoAmbiguous(proposals.legalNames);
  const ambiguousIpi = topTwoAmbiguous(proposals.ipis);
  const missingLegal = proposals.legalNames.length === 0;
  const missingIpi = proposals.ipis.length === 0;

  if (
    !hasScopeExclude &&
    !ambiguousLegal &&
    !ambiguousIpi &&
    !missingLegal &&
    proposals.legalNames.length === 1 &&
    (proposals.ipis.length === 1 || missingIpi)
  ) {
    return "auto";
  }

  if (
    context?.legalName &&
    (!ambiguousIpi || context.ipi) &&
    proposals.excludeAliasCandidates.every((c) => context.excludeAliases.includes(c.value))
  ) {
    return "resolved";
  }

  if (hasScopeExclude || ambiguousLegal || ambiguousIpi || missingLegal) {
    return "pending_identity";
  }

  return "pending_identity";
}
