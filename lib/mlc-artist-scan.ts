import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { isServerlessRuntime, mlcPythonAvailable } from "@/lib/runtime-env";

export interface MlcArtistHit {
  isrc: string;
  title: string;
  artist: string;
  provider: string;
  resourceType?: string;
}

export interface MlcUnclaimedHit {
  isrc: string;
  title: string;
  artist: string;
  workRecordId: string;
  unclaimedPct: number | null;
  dspResourceId: string;
}

export interface MlcArtistScanResult {
  artistName: string;
  slug: string;
  exportPath: string;
  uniqueIsrcCount: number;
  hits: MlcArtistHit[];
  fromCache: boolean;
  scanSource: "cache" | "duckdb" | "live" | "remote";
}

export interface MlcUnclaimedScanResult {
  artistName: string;
  slug: string;
  exportPath: string;
  uniqueIsrcCount: number;
  hits: MlcUnclaimedHit[];
  fromCache: boolean;
  scanSource: "cache" | "duckdb" | "live" | "remote";
}

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .toLowerCase() || "artist"
  );
}

function scansBaseDir(): string {
  const fromEnv = process.env.MLC_HU_DATA_DIR?.trim();
  if (fromEnv) return path.join(fromEnv, "hu_artist_scans");
  return path.join(process.cwd(), "derived", "mlc-hu", "hu_artist_scans");
}

function catalogDbPath(): string {
  const fromEnv = process.env.CATALOG_DUCKDB_PATH?.trim();
  if (fromEnv) return fromEnv;
  return path.join(process.cwd(), "data", "catalog.duckdb");
}

function duckdbEnabled(): boolean {
  if (process.env.MLC_USE_DUCKDB?.trim().toLowerCase() === "false") return false;
  if (isServerlessRuntime()) return false;
  return fs.existsSync(catalogDbPath());
}

function artistScanDir(artistName: string): string {
  return path.join(scansBaseDir(), slugify(artistName));
}

type MlcScanKind = "unmatched" | "unclaimed";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseUnmatchedExportCsv(filePath: string): MlcArtistHit[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  const idx = {
    isrc: header.indexOf("ISRC"),
    title: header.indexOf("ResourceTitle"),
    artist: header.indexOf("DisplayArtistName"),
    provider: header.indexOf("OriginalDataProviderName"),
    resourceType: header.indexOf("ResourceType"),
  };
  if (idx.isrc < 0) return [];

  const seen = new Set<string>();
  const hits: MlcArtistHit[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const isrc = (cols[idx.isrc] ?? "").trim().toUpperCase();
    if (!isrc || seen.has(isrc)) continue;
    seen.add(isrc);
    hits.push({
      isrc,
      title: (cols[idx.title] ?? "").trim(),
      artist: (cols[idx.artist] ?? "").trim(),
      provider: (cols[idx.provider] ?? "").trim(),
      resourceType: idx.resourceType >= 0 ? (cols[idx.resourceType] ?? "").trim() : undefined,
    });
  }
  return hits;
}

function parseUnclaimedExportCsv(filePath: string): MlcUnclaimedHit[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const header = lines[0].split(",");
  const idx = {
    isrc: header.indexOf("ISRC"),
    title: header.indexOf("ResourceTitle"),
    artist: header.indexOf("DisplayArtistName"),
    workRecordId: header.indexOf("MusicalWorkRecordId"),
    unclaimedPct: header.indexOf("UnclaimedRightSharePercentage"),
    dspResourceId: header.indexOf("DspResourceId"),
  };
  if (idx.isrc < 0) return [];

  const byIsrc = new Map<string, MlcUnclaimedHit>();

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const isrc = (cols[idx.isrc] ?? "").trim().toUpperCase();
    if (!isrc) continue;

    const pctRaw = (cols[idx.unclaimedPct] ?? "").trim();
    const pct = pctRaw ? Number.parseFloat(pctRaw) : null;
    const hit: MlcUnclaimedHit = {
      isrc,
      title: (cols[idx.title] ?? "").trim(),
      artist: (cols[idx.artist] ?? "").trim(),
      workRecordId: (cols[idx.workRecordId] ?? "").trim(),
      unclaimedPct: pct !== null && !Number.isNaN(pct) ? pct : null,
      dspResourceId: (cols[idx.dspResourceId] ?? "").trim(),
    };

    const existing = byIsrc.get(isrc);
    if (!existing) {
      byIsrc.set(isrc, hit);
      continue;
    }
    if (
      hit.unclaimedPct !== null &&
      (existing.unclaimedPct === null || hit.unclaimedPct > existing.unclaimedPct)
    ) {
      byIsrc.set(isrc, { ...existing, unclaimedPct: hit.unclaimedPct });
    }
  }

  return [...byIsrc.values()];
}

function runPythonJsonScript<T>(
  scriptRel: string,
  artistName: string,
  extraArgs: string[],
): Promise<T | null> {
  if (!mlcPythonAvailable()) return Promise.resolve(null);

  const script = path.join(process.cwd(), scriptRel);
  if (!fs.existsSync(script)) return Promise.resolve(null);

  const python = process.env.MLC_PYTHON?.trim() || "python3";
  const outDir = scansBaseDir();

  return new Promise((resolve) => {
    const args = [script, "--name", artistName, "--out-dir", outDir, ...extraArgs];
    const proc = spawn(python, args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        PATH: `${path.join(process.cwd(), ".venv/bin")}:${process.env.PATH ?? ""}`,
      },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    const timeoutMs = Number(process.env.MLC_ARTIST_SCAN_TIMEOUT_MS ?? 600_000) || 600_000;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: T | null) => {
      if (timer) clearTimeout(timer);
      resolve(result);
    };

    timer = setTimeout(() => {
      proc.kill("SIGTERM");
      finish(null);
    }, timeoutMs);

    proc.on("error", (err) => {
      console.error(`MLC script spawn failed (${scriptRel}):`, err.message);
      finish(null);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        console.error(`MLC script failed (${scriptRel}):`, stderr.slice(0, 500));
        finish(null);
        return;
      }
      try {
        finish(JSON.parse(stdout) as T);
      } catch {
        finish(null);
      }
    });
  });
}

async function scanViaDuckdb<T extends { hits: unknown[]; scanSource?: string }>(
  kind: MlcScanKind,
  artistName: string,
): Promise<(T & { fromCache: false; scanSource: "duckdb" }) | null> {
  const db = catalogDbPath();
  const parsed = await runPythonJsonScript<T>(
    "scripts/etl/export_artist_mlc_json.py",
    artistName,
    ["--kind", kind, "--db", db],
  );
  if (!parsed) return null;
  return { ...parsed, fromCache: false, scanSource: "duckdb" };
}

export function catalogAvailable(): boolean {
  return duckdbEnabled();
}

export function scanMlcArtistFromCache(artistName: string): MlcArtistScanResult | null {
  const slug = slugify(artistName);
  const exportPath = path.join(artistScanDir(artistName), `${slug}_mlc_export.csv`);
  const hits = parseUnmatchedExportCsv(exportPath);
  if (hits.length === 0) return null;
  return {
    artistName,
    slug,
    exportPath,
    uniqueIsrcCount: hits.length,
    hits,
    fromCache: true,
    scanSource: "cache",
  };
}

export function scanMlcUnclaimedFromCache(artistName: string): MlcUnclaimedScanResult | null {
  const slug = slugify(artistName);
  const exportPath = path.join(artistScanDir(artistName), `${slug}_mlc_unclaimed_export.csv`);
  const hits = parseUnclaimedExportCsv(exportPath);
  if (hits.length === 0) return null;
  return {
    artistName,
    slug,
    exportPath,
    uniqueIsrcCount: hits.length,
    hits,
    fromCache: true,
    scanSource: "cache",
  };
}

export async function scanMlcArtist(
  artistName: string,
  options?: { forceRefresh?: boolean },
): Promise<MlcArtistScanResult | null> {
  if (!options?.forceRefresh) {
    const cached = scanMlcArtistFromCache(artistName);
    if (cached) return cached;
  }

  if (duckdbEnabled()) {
    const fromDb = await scanViaDuckdb<Omit<MlcArtistScanResult, "fromCache" | "scanSource">>(
      "unmatched",
      artistName,
    );
    if (fromDb) return fromDb;
  }

  const tsv = process.env.MLC_UNMATCHED_TSV?.trim();
  if (!mlcPythonAvailable() || !tsv) return null;
  const extraArgs = ["--tsv", tsv];
  const parsed = await runPythonJsonScript<
    Omit<MlcArtistScanResult, "fromCache" | "scanSource">
  >("scripts/mlc/export_artist_mlc_json.py", artistName, extraArgs);
  if (!parsed) return null;
  return { ...parsed, fromCache: false, scanSource: "live" };
}

export async function scanMlcUnclaimedArtist(
  artistName: string,
  options?: { forceRefresh?: boolean },
): Promise<MlcUnclaimedScanResult | null> {
  if (!options?.forceRefresh) {
    const cached = scanMlcUnclaimedFromCache(artistName);
    if (cached) return cached;
  }

  if (duckdbEnabled()) {
    const fromDb = await scanViaDuckdb<Omit<MlcUnclaimedScanResult, "fromCache" | "scanSource">>(
      "unclaimed",
      artistName,
    );
    if (fromDb) return fromDb;
  }

  const tsv = process.env.MLC_UNCLAIMED_TSV?.trim();
  if (!mlcPythonAvailable() || !tsv) return null;
  const extraArgs = ["--tsv", tsv];
  const parsed = await runPythonJsonScript<
    Omit<MlcUnclaimedScanResult, "fromCache" | "scanSource">
  >("scripts/mlc/export_artist_unclaimed_json.py", artistName, extraArgs);
  if (!parsed) return null;
  return { ...parsed, fromCache: false, scanSource: "live" };
}
