import type { SourceDetailBlock } from "@/lib/artist-audit-row-details";
import { playbookIdForBlock } from "@/lib/recovery-mapper";
import { getPlaybook, toPlaybookSnapshot } from "@/lib/recovery-playbooks";
import type { PlaybookSnapshot } from "@/lib/recovery-types";
import type { AuditRow } from "@/lib/types";

export interface RowRecoveryItem {
  playbookId: string;
  snapshot: PlaybookSnapshot;
  sources: string[];
}

export interface RowRecoveryBundle {
  playbooks: RowRecoveryItem[];
  fallbacks: { source: string; headline: string; action: string }[];
}

/** One playbook per row — no repeat under every source block. */
export function recoveryBundleForAuditRow(
  row: AuditRow,
  details: SourceDetailBlock[],
): RowRecoveryBundle {
  const byId = new Map<string, RowRecoveryItem>();
  const fallbacks: RowRecoveryBundle["fallbacks"] = [];

  for (const block of details) {
    const id = playbookIdForBlock(block, row);
    if (id) {
      const entry = getPlaybook(id);
      if (entry) {
        const existing = byId.get(id);
        if (existing) {
          if (!existing.sources.includes(block.sourceLabel)) {
            existing.sources.push(block.sourceLabel);
          }
        } else {
          byId.set(id, {
            playbookId: id,
            snapshot: toPlaybookSnapshot(entry),
            sources: [block.sourceLabel],
          });
        }
        continue;
      }
    }

    if (block.action) {
      fallbacks.push({
        source: block.sourceLabel,
        headline: block.headline,
        action: block.action,
      });
    }
  }

  return { playbooks: [...byId.values()], fallbacks };
}
