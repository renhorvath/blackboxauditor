import {
  auditCanonicalKeys,
  requiredKeysForPlaybook,
} from "@/lib/recovery-case/canonical-keys";
import type { CanonicalFacts, RecoveryTarget, RecoveryTargetStatus } from "@/lib/recovery-case/types";

export function computeRecoveryTarget(
  playbookId: string,
  facts: CanonicalFacts,
): RecoveryTarget {
  const required = requiredKeysForPlaybook(playbookId);
  const { filledFields, missingFields } = auditCanonicalKeys(facts, required);

  let status: RecoveryTargetStatus = "ready";
  if (required.length === 0) {
    status = "partial";
  } else if (missingFields.length === required.length) {
    status = "blocked";
  } else if (missingFields.length > 0) {
    status = "partial";
  }

  return {
    playbookId,
    status,
    missingFields,
    filledFields,
  };
}

export function computeRecoveryTargets(
  playbookIds: string[],
  facts: CanonicalFacts,
): RecoveryTarget[] {
  const seen = new Set<string>();
  const targets: RecoveryTarget[] = [];
  for (const id of playbookIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    targets.push(computeRecoveryTarget(id, facts));
  }
  return targets.sort((a, b) => a.playbookId.localeCompare(b.playbookId));
}
