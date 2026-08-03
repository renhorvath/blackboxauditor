import { HomeAuditor } from "@/components/HomeAuditor";
import { OperatorConsole } from "@/components/OperatorConsole";
import { isServerlessRuntime } from "@/lib/runtime-env";
import { queryApiBaseUrl } from "@/lib/query-api-config";

export const metadata = {
  title: "Gyors ellenőrzés — Meder",
  description: "Nyilvános adatokon futó előzetes jogdíj-ellenőrzés.",
};

/** Self-serve scan tool (lead magnet). Formerly the home page. */
export default function CheckPage() {
  const auditEngineAvailable = !(isServerlessRuntime() && !queryApiBaseUrl());
  return auditEngineAvailable ? <HomeAuditor /> : <OperatorConsole />;
}
