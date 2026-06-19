"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown } from "lucide-react";
import { ArtistAuditRowCard } from "@/components/ArtistAuditRowCard";
import { GapBadgeStrip } from "@/components/GapBadgeStrip";
import type { WorkBucket } from "@/lib/audit-core/work-bucket-types";
import { isOpsModeClient } from "@/lib/ops-mode";

export function WorkBucketCard({
  bucket,
  queryArtistName,
  readOnly,
}: {
  bucket: WorkBucket;
  queryArtistName: string;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(bucket.hasPayoutProblem);
  const opsMode = isOpsModeClient();

  return (
    <li className="px-4 py-4">
      <div className="flex items-start gap-3">
        {bucket.hasPayoutProblem ? (
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--accent-critical)]" aria-hidden />
        ) : (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[var(--text-primary)]">{bucket.title}</p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {bucket.recordings.length} felvétel
            {bucket.iswc ? (
              <>
                {" "}
                · ISWC <span className="font-mono">{bucket.iswc}</span>
              </>
            ) : null}
          </p>
          {bucket.primaryGap ? (
            <GapBadgeStrip badges={[bucket.primaryGap]} showPriority={opsMode} />
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-primary)]"
          >
            <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} aria-hidden />
            {open ? "Felvételek elrejtése" : `${bucket.recordings.length} felvétel megnyitása`}
          </button>
          {open ? (
            <div className="mt-3 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
              {bucket.recordings.map((row) => (
                <ArtistAuditRowCard
                  key={`${bucket.workKey}-${row.isrc}`}
                  row={row}
                  queryArtistName={queryArtistName}
                  showRecovery={!readOnly}
                  showPublishToggle={false}
                  asListItem={false}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}
