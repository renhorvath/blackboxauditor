import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface MlcArtistHit {
  isrc: string;
  title: string;
  artist: string;
  provider: string;
}

export interface MlcArtistScanResult {
  artistName: string;
  slug: string;
  exportPath: string;
  uniqueIsrcCount: number;
  hits: MlcArtistHit[];
  fromCache: boolean;
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
  return "/Users/ren/synchreload/hu_artist_scans";
}

function exportCsvPath(artistName: string): string {
  const slug = slugify(artistName);
  return path.join(scansBaseDir(), slug, `${slug}_mlc_export.csv`);
}

function parseExportCsv(filePath: string): MlcArtistHit[] {
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
  };
  if (idx.isrc < 0) return [];

  const seen = new Set<string>();
  const hits: MlcArtistHit[] = [];

  for (const line of lines.slice(1)) {
    // Simple CSV — Carson export has quoted fields rarely in first columns
    const cols = parseCsvLine(line);
    const isrc = (cols[idx.isrc] ?? "").trim().toUpperCase();
    if (!isrc || seen.has(isrc)) continue;
    seen.add(isrc);
    hits.push({
      isrc,
      title: (cols[idx.title] ?? "").trim(),
      artist: (cols[idx.artist] ?? "").trim(),
      provider: (cols[idx.provider] ?? "").trim(),
    });
  }
  return hits;
}

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

export function scanMlcArtistFromCache(artistName: string): MlcArtistScanResult | null {
  const exportPath = exportCsvPath(artistName);
  const hits = parseExportCsv(exportPath);
  if (hits.length === 0) return null;
  return {
    artistName,
    slug: slugify(artistName),
    exportPath,
    uniqueIsrcCount: hits.length,
    hits,
    fromCache: true,
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

  const script = path.join(process.cwd(), "scripts/mlc/export_artist_mlc_json.py");
  if (!fs.existsSync(script)) return null;

  const tsv = process.env.MLC_UNMATCHED_TSV?.trim();
  const outDir = scansBaseDir().replace(/\/hu_artist_scans$/, "") + "/hu_artist_scans";

  return new Promise((resolve) => {
    const args = [script, "--name", artistName, "--out-dir", outDir];
    if (tsv) args.push("--tsv", tsv);

    const proc = spawn("python3", args, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
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
    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve(null);
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error("MLC artist scan failed:", stderr.slice(0, 500));
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as MlcArtistScanResult;
        resolve({ ...parsed, fromCache: false });
      } catch {
        resolve(null);
      }
    });
  });
}
