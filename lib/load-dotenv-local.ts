import fs from "node:fs";
import path from "node:path";

/** Load `.env.local` into process.env (does not override existing vars). */
export function loadDotenvLocal(cwd = process.cwd()): void {
  const file = path.join(cwd, ".env.local");
  if (!fs.existsSync(file)) return;

  const raw = fs.readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  applyDefaultMlcPython(cwd);
}

function applyDefaultMlcPython(cwd: string): void {
  if (process.env.MLC_PYTHON?.trim()) return;
  const venvPy = path.join(cwd, ".venv", "bin", "python3");
  try {
    fs.accessSync(venvPy, fs.constants.X_OK);
    process.env.MLC_PYTHON = venvPy;
  } catch {
    /* system python3 */
  }
}
