import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { cloudSqlPoolConfig, indexDatabaseUrl } from "@/lib/index-db-config";

let pool: Pool | null = null;

export function getIndexPool(): Pool {
  if (!pool) {
    const url = indexDatabaseUrl();
    if (!url) throw new Error("INDEX_DATABASE_URL is not configured");
    pool = new Pool({
      ...cloudSqlPoolConfig(url),
      max: 8,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 20_000,
    });
  }
  return pool;
}

export async function indexQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const result = await getIndexPool().query<T>(text, params);
  return result.rows;
}

export async function withIndexClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getIndexPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
