import { HomeAuditor } from "@/components/HomeAuditor";
import { OperatorConsole } from "@/components/OperatorConsole";
import { isServerlessRuntime } from "@/lib/runtime-env";
import { queryApiBaseUrl } from "@/lib/query-api-config";

export default function Home() {
  // The full audit engine needs local files / Python (data machine) or a remote query API.
  // On Vercel without QUERY_API_URL it is unavailable → show the operator console instead
  // of an empty audit form.
  const auditEngineAvailable = !(isServerlessRuntime() && !queryApiBaseUrl());

  return auditEngineAvailable ? <HomeAuditor /> : <OperatorConsole />;
}
