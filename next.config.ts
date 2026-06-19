import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/** Data machine: point MLC scripts at project venv (duckdb). Kept out of app bundles — Turbopack chokes on .venv symlinks. */
function defaultMlcPython(): string {
  if (process.env.MLC_PYTHON?.trim()) return process.env.MLC_PYTHON.trim();
  const venvPy = path.join(process.cwd(), ".venv", "bin", "python3");
  try {
    fs.accessSync(venvPy, fs.constants.X_OK);
    return venvPy;
  } catch {
    return "python3";
  }
}

const nextConfig: NextConfig = {
  env: {
    MLC_PYTHON: defaultMlcPython(),
  },
};

export default nextConfig;
