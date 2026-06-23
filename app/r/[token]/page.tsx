import { notFound } from "next/navigation";
import { PublishedReportView } from "@/components/PublishedReportView";
import { getCaseFindingsByToken, getReportByToken } from "@/lib/reports-db";

export const dynamic = "force-dynamic";

export default async function PublishedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getReportByToken(token);
  if (!report) notFound();

  let publicCaseNotes: Awaited<ReturnType<typeof getCaseFindingsByToken>> = [];
  try {
    const all = await getCaseFindingsByToken(token);
    publicCaseNotes = all.filter((c) => c.publicNote || c.status !== "open");
  } catch {
    /* case table optional if DB down */
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-6 md:py-10">
      <PublishedReportView
        report={report}
        publicCaseNotes={publicCaseNotes.map((c) => ({
          findingKey: c.findingKey,
          playbookId: c.playbookId,
          status: c.status,
          publicNote: c.publicNote,
        }))}
      />
    </div>
  );
}
