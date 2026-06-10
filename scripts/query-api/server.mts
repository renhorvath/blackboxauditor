#!/usr/bin/env npx tsx
/**
 * Query API — runs 24/7 on the data machine with DuckDB + JSON indexes.
 * Vercel sets QUERY_API_URL → this host (via Cloudflare Tunnel or VPS).
 *
 *   npm run query-api:start
 *   curl -s http://127.0.0.1:8787/health | jq
 */
import http from "node:http";
import { fetchLocalArtistSources } from "../../lib/artist-audit-sources";
import { artisjusIndexFileExists } from "../../lib/artisjus-index";
import { cmoIndexFileExists } from "../../lib/cmo-index";
import { searchEjiByArtist } from "../../lib/cmo-web/eji-search";
import { searchCmoWebByArtist } from "../../lib/cmo-web/search";
import { loadDotenvLocal } from "../../lib/load-dotenv-local";
import { withTimeout } from "../../lib/with-timeout";
import { catalogAvailable } from "../../lib/mlc-artist-scan";
import type { QueryApiHealthResponse } from "../../lib/query-api-types";

loadDotenvLocal();

const PORT = Number(process.env.QUERY_API_PORT ?? 8787);
const HOST = process.env.QUERY_API_HOST?.trim() || "127.0.0.1";
const API_KEY = process.env.QUERY_API_KEY?.trim() || null;
const MAX_BODY_BYTES = 16_384;

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function unauthorized(res: http.ServerResponse): void {
  json(res, 401, { error: "Unauthorized" });
}

function authOk(req: http.IncomingMessage): boolean {
  if (!API_KEY) return true;
  const header = req.headers.authorization ?? "";
  return header === `Bearer ${API_KEY}`;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function healthPayload(): QueryApiHealthResponse {
  return {
    ok: true,
    version: 1,
    capabilities: {
      catalog: catalogAvailable(),
      artisjusIndex: artisjusIndexFileExists(),
      cmoIndex: cmoIndexFileExists(),
    },
  };
}

const server = http.createServer(async (req, res) => {
  const url = req.url?.split("?")[0] ?? "";

  try {
    if (req.method === "GET" && url === "/health") {
      if (!authOk(req)) return unauthorized(res);
      return json(res, 200, healthPayload());
    }

    if (req.method === "POST" && url === "/v1/artist/sources") {
      if (!authOk(req)) return unauthorized(res);

      let body: {
        artistName?: string;
        forceRefresh?: boolean;
        bundle?: boolean;
        skipMlcUnmatched?: boolean;
        skipMlcUnclaimed?: boolean;
      };
      try {
        body = JSON.parse(await readBody(req)) as typeof body;
      } catch {
        return json(res, 400, { error: "Invalid JSON body" });
      }

      const artistName = body.artistName?.trim() ?? "";
      if (artistName.length < 2) {
        return json(res, 400, { error: "artistName must be at least 2 characters" });
      }

      const forceRefresh = body.forceRefresh === true;
      const sourceOpts = {
        forceRefresh,
        skipMlcUnmatched: body.skipMlcUnmatched === true,
        skipMlcUnclaimed: body.skipMlcUnclaimed === true,
      };

      if (body.bundle === true) {
        const [payload, eji, cmoWebResults] = await Promise.all([
          fetchLocalArtistSources(artistName, sourceOpts),
          withTimeout(
            searchEjiByArtist(artistName, { forceRefresh }).catch(() => null),
            28_000,
            null,
            "EJI search",
          ),
          withTimeout(
            searchCmoWebByArtist(artistName, { forceRefresh }).catch(() => []),
            22_000,
            [],
            "CMO web search",
          ),
        ]);
        return json(res, 200, { ...payload, eji, cmoWebResults });
      }

      const payload = await fetchLocalArtistSources(artistName, sourceOpts);
      return json(res, 200, payload);
    }

    if (req.method === "POST" && url === "/v1/cmo-web/search") {
      if (!authOk(req)) return unauthorized(res);

      let body: { artistName?: string; forceRefresh?: boolean };
      try {
        body = JSON.parse(await readBody(req)) as typeof body;
      } catch {
        return json(res, 400, { error: "Invalid JSON body" });
      }

      const artistName = body.artistName?.trim() ?? "";
      if (artistName.length < 2) {
        return json(res, 400, { error: "artistName must be at least 2 characters" });
      }

      const results = await searchCmoWebByArtist(artistName, {
        forceRefresh: body.forceRefresh === true,
      });
      return json(res, 200, { artistName, results });
    }

    json(res, 404, { error: "Not found" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.error("[query-api]", msg);
    json(res, 500, { error: msg });
  }
});

server.listen(PORT, HOST, () => {
  const caps = healthPayload().capabilities;
  console.log(`Query API listening on http://${HOST}:${PORT}`);
  console.log(`  catalog=${caps.catalog} artisjus=${caps.artisjusIndex} cmo=${caps.cmoIndex}`);
  if (!API_KEY) {
    console.warn("  WARNING: QUERY_API_KEY not set — API is open on this interface");
  }
});

server.on("error", (err: NodeJS.ErrnoException) => {
  console.error("[query-api] listen failed:", err.message);
  process.exit(err.code === "EADDRINUSE" ? 2 : 1);
});
