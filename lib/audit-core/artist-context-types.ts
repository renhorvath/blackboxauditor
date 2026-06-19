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
  /** Kollaborátor / zavaró név — kizárandó (pl. Mr. Bizz). */
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
