import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { searchEjiByArtist } from "@/lib/cmo-web/eji-search";

const execFileAsync = promisify(execFile);

const SOURCE_LABEL: Record<string, string> = {
  "nl-sena": "SENA",
  "ro-credidam": "CREDIDAM",
  "ee-eel": "EEL",
  "fi-gramex": "Gramex",
  "cz-intergram": "INTERGRAM",
  "de-gvl": "GVL",
};

const STOP = new Set([
  "the",
  "and",
  "feat",
  "ft",
  "featuring",
  "mix",
  "remix",
  "live",
  "radio",
  "edit",
  "version",
  "a",
  "an",
  "az",
  "egy",
  "es",
  "of",
  "in",
  "on",
  "with",
  "x",
]);

export type RadarActResult = {
  id: string;
  name: string;
  kind: string;
  blurb: string;
  ejiTrackCount: number;
  ejiArtistCount: number;
  foreignHitTotal: number;
  foreignBySource: Record<string, number>;
  pairedRecordingCount: number;
  strongPairCount: number;
  reviewPairCount: number;
  ejiOnlyCount: number;
  orphanForeignCount: number;
  ejiArtists: { refId: string; name: string; distributionPeriod: string }[];
  recordings: {
    id: string;
    title: string;
    mainArtist: string;
    year: number | null;
    publisher: string | null;
    tipus: string;
    foreignPairs: {
      source: string;
      label: string;
      performer: string;
      title: string;
      isrc: string | null;
      file: string;
      confidence: "strong" | "review";
    }[];
    ejiOnly: boolean;
  }[];
  orphanForeign: {
    source: string;
    label: string;
    performer: string;
    title: string;
    isrc: string | null;
    file: string;
    matchNote: string;
  }[];
  ejiFetchedAt?: string;
  fromCache?: boolean;
  rosterMatched: boolean;
};

function fold(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/\+/g, " ")
    .replace(/[^\w\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleTokens(s: string, drop: Set<string>): Set<string> {
  return new Set(
    fold(s)
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP.has(t) && !drop.has(t)),
  );
}

function decodeHtml(s: string): string {
  return s
    .replace(/&#039;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function slugify(name: string): string {
  const base = fold(name).replace(/\s+/g, "-") || "query";
  return `live-${base.slice(0, 40)}-${createHash("sha1").update(name).digest("hex").slice(0, 6)}`;
}

type SampleRow = {
  act_id: string;
  act: string;
  kind: string;
  source: string;
  performer: string;
  title: string;
  isrc: string;
  file: string;
};

type SummaryRow = Record<string, string>;

type RosterAct = {
  id: string;
  name: string;
  kind?: string;
  aliases?: string[];
};

async function loadCsv(rel: string): Promise<string[][]> {
  try {
    const raw = await readFile(path.join(process.cwd(), rel), "utf8");
    return raw
      .trim()
      .split(/\r?\n/)
      .map((line) => {
        const out: string[] = [];
        let cur = "";
        let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            inQ = !inQ;
            continue;
          }
          if (ch === "," && !inQ) {
            out.push(cur);
            cur = "";
            continue;
          }
          cur += ch;
        }
        out.push(cur);
        return out;
      });
  } catch {
    return [];
  }
}

async function loadNeighbouring(): Promise<{
  samples: SampleRow[];
  summaryById: Map<string, SummaryRow>;
  roster: RosterAct[];
}> {
  try {
    const [sampleRows, summaryRows, rosterRaw] = await Promise.all([
      loadCsv("data/cmo/hu-acts/neighbouring_hit_samples.csv"),
      loadCsv("data/cmo/hu-acts/neighbouring_summary.csv"),
      readFile(path.join(process.cwd(), "data/cmo/hu-acts/roster.json"), "utf8").catch(
        () => "[]",
      ),
    ]);

    if (!sampleRows.length) {
      return { samples: [], summaryById: new Map(), roster: [] };
    }

  const sampleHeader = sampleRows[0];
  const samples: SampleRow[] = sampleRows.slice(1).map((cols) => {
    const row: Record<string, string> = {};
    sampleHeader.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row as SampleRow;
  });

  const summaryHeader = summaryRows[0];
  const summaryById = new Map<string, SummaryRow>();
  for (const cols of summaryRows.slice(1)) {
    const row: SummaryRow = {};
    summaryHeader.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    summaryById.set(row.act_id, row);
  }

  const roster = (JSON.parse(rosterRaw) as { acts: RosterAct[] }).acts;
  return { samples, summaryById, roster };
  } catch {
    return { samples: [], summaryById: new Map(), roster: [] };
  }
}

function resolveRosterAct(query: string, roster: RosterAct[]): RosterAct | null {
  const q = fold(query);
  if (!q) return null;
  for (const act of roster) {
    const names = [act.name, ...(act.aliases ?? [])].map(fold);
    if (names.some((n) => n === q)) return act;
  }
  for (const act of roster) {
    const names = [act.name, ...(act.aliases ?? [])].map(fold);
    if (names.some((n) => n.includes(q) || q.includes(n))) return act;
  }
  return null;
}

type ForeignHit = {
  source: string;
  performer: string;
  title: string;
  isrc: string | null;
  file: string;
};

async function loadForeignIndex(): Promise<ForeignHit[]> {
  try {
    const raw = await readFile(
      path.join(process.cwd(), "data/demo/neighbouring-foreign-index.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as {
      rows: {
        source: string;
        performer: string;
        title: string;
        isrc: string | null;
        file: string;
        performer_fold?: string;
      }[];
    };
    return (parsed.rows ?? []).map((r) => ({
      source: r.source,
      performer: r.performer,
      title: r.title,
      isrc: r.isrc,
      file: r.file,
    }));
  } catch {
    return [];
  }
}

type DuckHit = {
  source: string;
  label?: string;
  performer: string;
  title: string;
  isrc: string | null;
  file: string;
};

async function queryAllNeighbouring(query: string): Promise<{
  hits: ForeignHit[];
  indexCounts: Record<string, number>;
}> {
  const script = path.join(
    process.cwd(),
    "scripts/cmo/query_neighbouring_demo.py",
  );
  try {
    const { stdout } = await execFileAsync("python3", [script, query], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60_000,
    });
    const parsed = JSON.parse(stdout) as {
      hits?: DuckHit[];
      indexCounts?: Record<string, number>;
      error?: string;
    };
    if (parsed.error && !parsed.hits?.length) {
      console.warn("[neighbouring-demo]", parsed.error);
      return { hits: [], indexCounts: {} };
    }
    return {
      hits: (parsed.hits ?? []).map((h) => ({
        source: h.source,
        performer: h.performer,
        title: h.title,
        isrc: h.isrc,
        file: h.file,
      })),
      indexCounts: parsed.indexCounts ?? {},
    };
  } catch (e) {
    console.warn("[neighbouring-demo] duckdb query failed", e);
    return { hits: [], indexCounts: {} };
  }
}

function performerMatchesQuery(performer: string, query: string): boolean {
  const p = fold(performer);
  const q = fold(query);
  if (!p || !q) return false;
  if (p === q || p.includes(q) || q.includes(p)) return true;
  const qTokens = q.split(/\s+/).filter((t) => t.length >= 3);
  if (qTokens.length === 0) return false;
  return qTokens.every((t) => p.includes(t));
}

export async function buildNeighbouringActSearch(
  queryRaw: string,
): Promise<RadarActResult> {
  const query = queryRaw.trim();
  const [{ samples, summaryById, roster }, foreignIndex, duck] =
    await Promise.all([
      loadNeighbouring(),
      loadForeignIndex(),
      queryAllNeighbouring(query),
    ]);
  const rosterAct = resolveRosterAct(query, roster);
  const eji = await searchEjiByArtist(rosterAct?.name ?? query);

  const actId = rosterAct?.id ?? slugify(query);
  const name = rosterAct?.name ?? query;
  const kind = rosterAct?.kind ?? "act";
  const sum = rosterAct ? summaryById.get(rosterAct.id) : undefined;

  const fromSamples: ForeignHit[] = (
    rosterAct
      ? samples.filter((s) => s.act_id === rosterAct.id)
      : samples.filter((s) => performerMatchesQuery(s.performer, query))
  ).map((s) => ({
    source: s.source,
    performer: s.performer,
    title: s.title,
    isrc: s.isrc || null,
    file: s.file,
  }));

  const fromIndex = foreignIndex.filter(
    (r) =>
      performerMatchesQuery(r.performer, query) ||
      performerMatchesQuery(r.performer, name),
  );

  const foreignRaw = [...duck.hits, ...fromSamples, ...fromIndex];
  const seen = new Set<string>();
  const foreignU = foreignRaw.filter((f) => {
    const key = `${f.source}|${fold(f.title)}|${f.isrc ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const drop = new Set([
    ...titleTokens(name, new Set()),
    ...titleTokens(query, new Set()),
  ]);
  const trackCap = 80;
  const tracks = (eji.trackHits ?? []).slice(0, trackCap).map((t) => {
    const title = decodeHtml(t.title);
    const ft = fold(title);
    const ta = titleTokens(title, drop);
    const pairs: RadarActResult["recordings"][number]["foreignPairs"] = [];

    for (const f of foreignU) {
      const ff = fold(f.title);
      if (!ff) continue;
      let confidence: "strong" | "review" | null = null;
      if (
        ft === ff ||
        (ft.length >= 8 && ff.length >= 8 && (ft.includes(ff) || ff.includes(ft)))
      ) {
        confidence = "strong";
      } else {
        const tb = titleTokens(f.title, drop);
        const shared = [...ta].filter((x) => tb.has(x));
        if (shared.length >= 2) confidence = shared.length >= 3 ? "strong" : "review";
        else if (shared.length === 1 && shared[0].length >= 6) confidence = "review";
      }
      if (!confidence) continue;
      pairs.push({
        source: f.source,
        label: SOURCE_LABEL[f.source] ?? f.source,
        performer: f.performer,
        title: f.title,
        isrc: f.isrc,
        file: f.file,
        confidence,
      });
    }

    return {
      id: t.id,
      title,
      mainArtist: decodeHtml(t.mainArtist),
      year: t.publicationYear,
      publisher: t.publisher || null,
      tipus: t.tipus,
      foreignPairs: pairs,
      ejiOnly: pairs.length === 0,
    };
  });

  const pairedKeys = new Set(
    tracks.flatMap((tr) =>
      tr.foreignPairs.map((p) => `${p.source}|${fold(p.title)}`),
    ),
  );
  const orphans = foreignU
    .filter((f) => !pairedKeys.has(`${f.source}|${fold(f.title)}`))
    .slice(0, 40)
    .map((f) => ({
      source: f.source,
      label: SOURCE_LABEL[f.source] ?? f.source,
      performer: f.performer,
      title: f.title || "(cím nélkül)",
      isrc: f.isrc,
      file: f.file,
      matchNote: fold(f.title)
        ? "külföldi UP — EJI felvétellel még nem párosítva"
        : "név-only UP — identity pairing kell",
    }));

  const foreignBySource: Record<string, number> = {};
  for (const key of Object.keys(SOURCE_LABEL)) {
    const fromLive = foreignU.filter((f) => f.source === key).length;
    foreignBySource[key] = Math.max(
      fromLive,
      sum ? Number(sum[key] || 0) : 0,
    );
  }

  const foreignHitTotal = Math.max(
    foreignU.length,
    sum ? Number(sum.total || 0) : 0,
  );

  const paired = tracks.filter((t) => t.foreignPairs.length > 0).length;
  const strong = tracks.reduce(
    (n, t) => n + t.foreignPairs.filter((p) => p.confidence === "strong").length,
    0,
  );
  const review = tracks.reduce(
    (n, t) => n + t.foreignPairs.filter((p) => p.confidence === "review").length,
    0,
  );

  return {
    id: actId,
    name,
    kind,
    blurb:
      "Élő EJI + teljes neighbouring index (SENA, CREDIDAM, EEL, Gramex, INTERGRAM, GVL).",
    ejiTrackCount: eji.trackHits.length,
    ejiArtistCount: eji.artistHits.length,
    foreignHitTotal,
    foreignBySource,
    pairedRecordingCount: paired,
    strongPairCount: strong,
    reviewPairCount: review,
    ejiOnlyCount: tracks.filter((t) => t.ejiOnly).length,
    orphanForeignCount: orphans.length,
    ejiArtists: eji.artistHits.map((a) => ({
      refId: a.refId,
      name: a.name,
      distributionPeriod: a.distributionPeriod || "",
    })),
    recordings: tracks,
    orphanForeign: orphans,
    ejiFetchedAt: eji.fetchedAt,
    fromCache: eji.fromCache,
    rosterMatched: Boolean(rosterAct),
  };
}
