"use client";

import type { GapBadge } from "@/lib/audit-core/gap-types";

const PRIORITY_CLASS: Record<GapBadge["priority"], string> = {
  P0: "bg-[color-mix(in_srgb,var(--accent-critical)_12%,transparent)] text-[var(--accent-critical)]",
  P1: "bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)] text-[var(--accent-primary)]",
  P2: "bg-[var(--bg-secondary)] text-[var(--text-muted)]",
};

export function GapBadgeStrip({
  badges,
  showPriority = false,
}: {
  badges: GapBadge[];
  showPriority?: boolean;
}) {
  if (badges.length === 0) return null;

  return (
    <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Metaadat és gap jelzések">
      {badges.map((badge) => (
        <li key={badge.kind}>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_CLASS[badge.priority]}`}
            title={badge.catalogHint}
          >
            {badge.label}
            {showPriority ? <span className="font-mono opacity-70">{badge.priority}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}
