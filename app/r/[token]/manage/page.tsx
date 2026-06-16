import { ReportManageClient } from "@/components/ReportManageClient";

export default async function ReportManagePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <ReportManageClient token={token} />
    </div>
  );
}
