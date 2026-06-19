import { deriveGapBadges } from "@/lib/audit-core/derive-gap-badges";
import { rowHasPayoutProblem } from "@/lib/artist-audit-display";
import { auditRowKey } from "@/lib/artist-audit-filters";
import { artistSlug } from "@/lib/recovery-case/artist-slug";
import { blackboxHitsFromRow } from "@/lib/recovery-case/blackbox-from-row";
import { computeRecoveryTargets } from "@/lib/recovery-case/compute-targets";
import { canonicalFactsFromRow } from "@/lib/recovery-case/facts-from-row";
import { uniquePlaybookIdsFromRow } from "@/lib/recovery-case/playbook-helpers";
import type { RecoveryCase, RecoveryCaseBundle } from "@/lib/recovery-case/types";
import type { AuditRow } from "@/lib/types";

export function buildRecoveryCaseFromRow(input: {
  row: AuditRow;
  artistDisplayName: string;
  slug?: string;
  legalName?: string | null;
}): RecoveryCase | null {
  if (!rowHasPayoutProblem(input.row)) return null;

  const slug = input.slug ?? artistSlug(input.artistDisplayName);
  const findingKey = auditRowKey(input.row);
  const caseId = `${slug}:${findingKey}`;
  const facts = canonicalFactsFromRow(input.row, {
    legalName: input.legalName,
    artistDisplayName: input.artistDisplayName,
  });
  const blackboxHits = blackboxHitsFromRow(input.row);
  const playbookIds = uniquePlaybookIdsFromRow(input.row);
  const recoveryTargets = computeRecoveryTargets(playbookIds, facts);
  const gapBadges = deriveGapBadges(input.row, input.artistDisplayName);
  const generatedAt = new Date().toISOString();

  return {
    caseId,
    findingKey,
    artistSlug: slug,
    artistDisplayName: input.artistDisplayName,
    facts,
    blackboxHits,
    gapBadges,
    recoveryTargets,
    generatedAt,
  };
}

export function buildRecoveryCases(input: {
  artistDisplayName: string;
  rows: AuditRow[];
  legalName?: string | null;
  problemsOnly?: boolean;
}): RecoveryCaseBundle {
  const slug = artistSlug(input.artistDisplayName);
  const generatedAt = new Date().toISOString();
  const rows = input.problemsOnly === false ? input.rows : input.rows.filter(rowHasPayoutProblem);

  const cases: RecoveryCase[] = [];
  for (const row of rows) {
    const recoveryCase = buildRecoveryCaseFromRow({
      row,
      artistDisplayName: input.artistDisplayName,
      slug,
      legalName: input.legalName,
    });
    if (recoveryCase) cases.push(recoveryCase);
  }

  return {
    version: 1,
    artistSlug: slug,
    artistDisplayName: input.artistDisplayName,
    generatedAt,
    caseCount: cases.length,
    cases,
  };
}
