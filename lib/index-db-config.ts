/**
 * Cloud SQL index DB config.
 * Prefer INDEX_DATABASE_URL (read-only meder_ro). Loader uses INDEX_LOADER_DATABASE_URL.
 */

export function indexDatabaseUrl(): string | null {
  const raw = process.env.INDEX_DATABASE_URL?.trim();
  return raw || null;
}

export function indexLoaderDatabaseUrl(): string | null {
  const raw = process.env.INDEX_LOADER_DATABASE_URL?.trim();
  return raw || null;
}

export function indexDbConfigured(): boolean {
  return Boolean(indexDatabaseUrl());
}

/** Cloud SQL public IP: TLS on, but don't require a local CA bundle. */
export function cloudSqlPoolConfig(connectionString: string) {
  const url = connectionString
    .replace(/[?&]sslmode=[^&]*/g, "")
    .replace(/\?&/, "?")
    .replace(/\?$/, "");
  return {
    connectionString: url,
    ssl: { rejectUnauthorized: false } as const,
  };
}
