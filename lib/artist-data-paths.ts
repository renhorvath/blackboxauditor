import fs from "node:fs";
import path from "node:path";

/** Root for per-artist files: `data/artists/{slug}/` (override: `ARTISTS_DATA_DIR`). */
export function artistsDataDir(): string {
  const override = process.env.ARTISTS_DATA_DIR?.trim();
  if (override) return override;
  return path.join(process.cwd(), "data", "artists");
}

export function artistDataPath(slug: string, filename: string): string {
  return path.join(artistsDataDir(), slug, filename);
}

export interface ArtistCatalogFiles {
  mlcWorksCsv: string | null;
  iswcNetJson: string | null;
  catalogSeedCsv: string | null;
  mlcSongCodesJson: string | null;
}

function fileIfExists(filePath: string): string | null {
  return fs.existsSync(filePath) ? filePath : null;
}

/** Optional enrich sidecars under `data/artists/{slug}/`. */
export function resolveArtistCatalogFiles(slug: string | null | undefined): ArtistCatalogFiles {
  if (!slug?.trim()) {
    return {
      mlcWorksCsv: null,
      iswcNetJson: null,
      catalogSeedCsv: null,
      mlcSongCodesJson: null,
    };
  }

  const base = path.join(artistsDataDir(), slug.trim());
  return {
    mlcWorksCsv: fileIfExists(path.join(base, "mlc_works.csv")),
    iswcNetJson: fileIfExists(path.join(base, "iswc_net.json")),
    catalogSeedCsv: fileIfExists(path.join(base, "catalog_seed.csv")),
    mlcSongCodesJson: fileIfExists(path.join(base, "mlc_song_codes.json")),
  };
}
