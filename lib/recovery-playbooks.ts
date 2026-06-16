import type { PlaybookEntry } from "@/lib/recovery-types";
import { toPlaybookSnapshot } from "@/lib/recovery-types";
import { PLAYBOOK_ENTRIES } from "@/lib/recovery-playbooks-data/index";

const PLAYBOOKS: Record<string, PlaybookEntry> = Object.fromEntries(
  PLAYBOOK_ENTRIES.map((entry) => [entry.id, entry]),
);

export { toPlaybookSnapshot };

export function getPlaybook(id: string): PlaybookEntry | undefined {
  return PLAYBOOKS[id];
}

export function listPlaybooks(): PlaybookEntry[] {
  return Object.values(PLAYBOOKS);
}

export function playbookIds(): string[] {
  return Object.keys(PLAYBOOKS);
}
