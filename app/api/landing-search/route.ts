import { after, NextRequest, NextResponse } from "next/server";
import { runLandingTeaser } from "@/lib/artist-audit";
import {
  normalizeLandingQuery,
  persistLandingSearch,
  readLandingSearchCache,
} from "@/lib/landing-search-db";
import type { LandingTeaserResult } from "@/lib/landing-teaser";

/** EJI scrape (~40s) + CMO web run in parallel; MLC is skipped for the teaser. */
export const maxDuration = 120;

function logLandingSearch(payload: Record<string, unknown>): void {
  console.info(JSON.stringify({ event: "landing_search", ...payload }));
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let body: { artistName?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const artistName = body.artistName?.trim() ?? "";
  if (artistName.length < 2) {
    return NextResponse.json({ error: "Érvénytelen előadónév." }, { status: 400 });
  }

  const queryNorm = normalizeLandingQuery(artistName);

  try {
    const cached = await readLandingSearchCache(queryNorm);
    const result: LandingTeaserResult = cached ?? (await runLandingTeaser(artistName));
    const cacheHit = Boolean(cached);
    const durationMs = Date.now() - started;

    logLandingSearch({
      query: artistName,
      queryNorm,
      status: result.status,
      cache: cacheHit ? "hit" : "miss",
      ms: durationMs,
      societies: result.summary.societies,
      totalItems: result.summary.totalItems,
    });

    after(() =>
      persistLandingSearch({
        event: {
          queryRaw: artistName,
          queryNorm,
          status: result.status,
          cacheHit,
          durationMs,
          societies: result.summary.societies,
          totalItems: result.summary.totalItems,
          countries: result.summary.countries,
        },
        result,
      }).catch((err) => {
        console.warn("[landing_search] persist failed:", err);
      }),
    );

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Ismeretlen hiba";
    const durationMs = Date.now() - started;
    logLandingSearch({
      query: artistName,
      queryNorm,
      status: "error",
      cache: "miss",
      ms: durationMs,
      error: msg,
    });
    after(() =>
      persistLandingSearch({
        event: {
          queryRaw: artistName,
          queryNorm,
          status: "error",
          cacheHit: false,
          durationMs,
          societies: 0,
          totalItems: 0,
          countries: 0,
        },
      }).catch((err) => {
        console.warn("[landing_search] persist failed:", err);
      }),
    );
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
