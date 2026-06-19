import fs from "node:fs/promises";
import path from "node:path";
import type { ArtistContext } from "@/lib/audit-core/artist-context-types";
import { artistSlug } from "@/lib/recovery-case/artist-slug";
import { isServerlessRuntime } from "@/lib/runtime-env";

function artistsDataDir(): string {
  const override = process.env.ARTISTS_DATA_DIR?.trim();
  if (override) return override;
  return path.join(process.cwd(), "data", "artists");
}

function contextFilePath(slug: string): string {
  return path.join(artistsDataDir(), slug, "context.json");
}

export function artistContextSlug(displayName: string): string {
  return artistSlug(displayName);
}

export function artistContextStorageAvailable(): boolean {
  return !isServerlessRuntime();
}

export async function loadArtistContext(slug: string): Promise<ArtistContext | null> {
  if (!artistContextStorageAvailable()) return null;
  try {
    const raw = await fs.readFile(contextFilePath(slug), "utf8");
    return JSON.parse(raw) as ArtistContext;
  } catch {
    return null;
  }
}

export async function saveArtistContext(context: ArtistContext): Promise<ArtistContext> {
  if (!artistContextStorageAvailable()) {
    throw new Error("Artist context storage is only available on the data machine.");
  }
  const dir = path.dirname(contextFilePath(context.slug));
  await fs.mkdir(dir, { recursive: true });
  const next: ArtistContext = {
    ...context,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(contextFilePath(context.slug), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
