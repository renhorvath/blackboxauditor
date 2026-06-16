export type PlaybookConfidence = "verified" | "draft" | "unknown";

export interface PlaybookStep {
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface PlaybookRequiredField {
  field: string;
  required: boolean;
  whereToGet?: string;
}

export interface PlaybookChannel {
  type: "portal" | "email" | "phone" | "form";
  url?: string;
  address?: string;
  label: string;
}

export interface PlaybookEntry {
  id: string;
  organization: string;
  country: string;
  rightsType: "musical_work" | "mechanical" | "neighbouring";
  summary: string;
  eligibility?: string;
  steps: PlaybookStep[];
  requiredData: PlaybookRequiredField[];
  requiredPermissions: string[];
  documents?: string[];
  channels: PlaybookChannel[];
  timelines?: string;
  fees?: string;
  pitfalls?: string[];
  sources: { url: string; title: string; checkedAt: string }[];
  version: string;
  confidence: PlaybookConfidence;
}

/** Frozen copy embedded in published report snapshot */
export type PlaybookSnapshot = Pick<
  PlaybookEntry,
  | "id"
  | "organization"
  | "summary"
  | "steps"
  | "requiredData"
  | "requiredPermissions"
  | "channels"
  | "pitfalls"
  | "confidence"
  | "version"
>;

export function toPlaybookSnapshot(entry: PlaybookEntry): PlaybookSnapshot {
  return {
    id: entry.id,
    organization: entry.organization,
    summary: entry.summary,
    steps: entry.steps,
    requiredData: entry.requiredData,
    requiredPermissions: entry.requiredPermissions,
    channels: entry.channels,
    pitfalls: entry.pitfalls,
    confidence: entry.confidence,
    version: entry.version,
  };
}
