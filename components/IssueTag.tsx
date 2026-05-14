import type { ReactNode } from "react";
import type { IssueSeverity } from "@/lib/types";

const styles: Record<IssueSeverity, string> = {
  critical:
    "bg-[color-mix(in_srgb,var(--accent-critical)_18%,transparent)] text-[var(--accent-critical)] border-[color-mix(in_srgb,var(--accent-critical)_35%,transparent)]",
  warning:
    "bg-[color-mix(in_srgb,var(--accent-warning)_18%,transparent)] text-[var(--accent-warning)] border-[color-mix(in_srgb,var(--accent-warning)_35%,transparent)]",
  info: "bg-[color-mix(in_srgb,var(--accent-muted)_18%,transparent)] text-[var(--accent-muted)] border-[color-mix(in_srgb,var(--accent-muted)_35%,transparent)]",
};

export function IssueTag({
  severity,
  children,
}: {
  severity: IssueSeverity;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-wide ${styles[severity]}`}
    >
      {children}
    </span>
  );
}
