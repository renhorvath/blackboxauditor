export type IdentityStatus = "pending_identity" | "resolved" | "auto" | "skipped";

export interface IdentityVoteCandidate {
  value: string;
  votes: number;
  sources: string[];
}

export interface IdentityProposals {
  slug: string;
  displayName: string;
  /** Művésznév variánsok (pontos / szóegyezés). */
  aliasCandidates: IdentityVoteCandidate[];
  /** Feat / vendég ugyanazon a tracken — nem kizárás. */
  featCollaborators: IdentityVoteCandidate[];
  /** Katalógus-scope: más előadó dominál (pl. Mr. Bizz solo). */
  excludeAliasCandidates: IdentityVoteCandidate[];
  legalNames: IdentityVoteCandidate[];
  ipis: IdentityVoteCandidate[];
}

export interface ArtistContext {
  slug: string;
  displayName: string;
  spotifyId?: string | null;
  aliases: string[];
  excludeAliases: string[];
  legalName: string | null;
  ipi: string | null;
  wizardCompletedAt: string | null;
  updatedAt: string;
}

export interface IdentitySnapshot {
  status: IdentityStatus;
  context: ArtistContext | null;
  proposals: IdentityProposals | null;
}
