/** True on Vercel / AWS Lambda — no local python3, no multi-GB TSV/DuckDB files. */
export function isServerlessRuntime(): boolean {
  return (
    process.env.VERCEL === "1" ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
    Boolean(process.env.VERCEL_ENV)
  );
}

/** Python MLC scripts only run on the data machine (local dev / self-hosted). */
export function mlcPythonAvailable(): boolean {
  const override = process.env.MLC_PYTHON?.trim();
  if (override) return true;
  if (isServerlessRuntime()) return false;
  return true;
}
