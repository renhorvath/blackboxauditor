import type {
  AuditIssue,
  AuditRow,
  AuditSummary,
  BatchRecordingData,
  BatchResult,
  ShareAuditResult,
  UnmatchedAuditResult,
} from "@/lib/types";

function hasMlcFootprint(
  data: BatchRecordingData | null | undefined,
  unmatched: UnmatchedAuditResult | undefined,
): boolean {
  if (!data) return false;
  if (data.mlc_portal_url || data.mlc_song_code) return true;
  if (data.sources?.some((s) => s.toLowerCase() === "mlc")) return true;
  const ms = unmatched?.match_status;
  return ms === "matched" || ms === "unmatched";
}

/** Named contributor rows without IPI (songwriters / publishers from batch). */
function countNamedMissingIpi(nodes: unknown[] | undefined): number {
  if (!nodes?.length) return 0;
  let n = 0;
  for (const item of nodes) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = String(o.name ?? "").trim();
    const ipi = String(o.ipi ?? "").trim();
    if (!name) continue;
    if (!ipi) n++;
  }
  return n;
}

export function buildAuditRows(
  batchResults: BatchResult[],
  shareResults: ShareAuditResult[],
  unmatchedResults: UnmatchedAuditResult[],
): AuditRow[] {
  return batchResults.map((batch) => {
    const share = shareResults.find((s) => s.isrc === batch.id);
    const unmatched = unmatchedResults.find((u) => u.isrc === batch.id);
    const issues: AuditIssue[] = [];

    if (!batch.found) {
      issues.push({
        type: "not_found",
        severity: "critical",
        message:
          "Ez az ISRC-kód nem szerepel egyetlen ismert adatbázisban sem.",
        action:
          "Ellenőrizd az ISRC formátumát. Ha helyes, regisztráld az IFPI-nál vagy a distributoroddal.",
      });
    }

    if (batch.found && !batch.data?.iswc) {
      issues.push({
        type: "no_iswc",
        severity: "critical",
        message:
          "Nincs ISWC (International Standard Musical Work Code) hozzárendelve ehhez a felvételhez.",
        action:
          "Regisztráld a művet a CISAC-nál a tagszervezeted (pl. ARTISJUS) közreműködésével, hogy ISWC-t kapjon.",
      });
    }

    if (unmatched?.match_status === "unmatched") {
      issues.push({
        type: "no_mlc_match",
        severity: "critical",
        message:
          "Az MLC (Mechanical Licensing Collective) összegyűjtött mechanikai jogdíjat ehhez a felvételhez, de nem találja a jogosultat.",
        action:
          "Regisztrálj az MLC-nél (themlc.com), vagy kérd meg az ARTISJUS-t, hogy reciprocity agreement keretében igényelje a jogdíjat.",
      });
    }

    if (unmatched?.match_status === "not_in_mlc") {
      issues.push({
        type: "not_in_mlc",
        severity: "warning",
        message:
          "Ez a felvétel nem szerepel az MLC adatbázisában. Az USA-ból érkező mechanikai jogdíj elveszhet.",
        action:
          "Ellenőrizd, hogy a publisher regisztrálva van-e az MLC-nél, és a felvétel össze van-e kapcsolva a művel.",
      });
    }

    if (share?.share_status === "incomplete") {
      issues.push({
        type: "incomplete_shares",
        severity: "warning",
        message: `A szerzői tulajdonrészek összege csak ${share.total_share ?? "?"}% (hiányzik: ${share.missing_share ?? "?"}%).`,
        action:
          "Ellenőrizd az összes szerzőnél, hogy a publishing oldal regisztrálva van-e, és a share-ek helyesen vannak-e megadva.",
      });
    }

    if (share?.share_status === "over_allocated") {
      issues.push({
        type: "over_allocated",
        severity: "critical",
        message: `A szerzői tulajdonrészek összege ${share.total_share ?? "?"}% — több mint 100%.`,
        action:
          "Duplikált regisztráció vagy téves share-megadás valószínű. Fordulj a publisherhez és az ARTISJUS-hoz.",
      });
    }

    if (batch.found && share?.share_status === "missing") {
      issues.push({
        type: "missing_shares",
        severity: "warning",
        message:
          "Nincsenek összesített szerzői tulajdonrészek (share) ehhez az ISRC-hez a credits.fm audit szerint — az MLC / registry nézetben ez gyakran üres vagy hiányos.",
        action:
          "Ellenőrizd az MLC és a PRO oldali műregisztrációt; egészítsd ki a szerzői részeket és az IPI-ket.",
      });
    }

    if (
      batch.found &&
      hasMlcFootprint(batch.data, unmatched)
    ) {
      const writersNoIpi = countNamedMissingIpi(batch.data?.songwriters);
      const pubsNoIpi = countNamedMissingIpi(batch.data?.publishers);
      if (writersNoIpi > 0 || pubsNoIpi > 0) {
        const parts: string[] = [];
        if (writersNoIpi > 0) {
          parts.push(
            writersNoIpi === 1
              ? "1 szerzőnek nincs IPI"
              : `${writersNoIpi} szerzőnek nincs IPI`,
          );
        }
        if (pubsNoIpi > 0) {
          parts.push(
            pubsNoIpi === 1
              ? "1 kiadónak nincs IPI"
              : `${pubsNoIpi} kiadónak nincs IPI`,
          );
        }
        issues.push({
          type: "missing_ipi_mlc",
          severity: "warning",
          message: `${parts.join("; ")} az egyesített credits.fm / MLC vonatkozású rekordban.`,
          action:
            "Igazítsd az IPI-ket az ARTISJUS / CISAC szerinti szerzői és kiadói regisztrációkhoz; az MLC-ben hiányzó IPI megnehezíti a jogosultság egyeztetését.",
        });
      }
    }

    if (
      batch.found &&
      (!batch.data?.songwriters || batch.data.songwriters.length === 0)
    ) {
      const apiIndexesSongwritersMissing =
        batch.data?.missing_fields?.includes("songwriters") ?? false;
      issues.push({
        type: "no_songwriter",
        severity: "warning",
        message: apiIndexesSongwritersMissing
          ? "A credits.fm REST API szerint ehhez az ISRC-hez nincs szerzőrekord az indexben (missing_fields: songwriters). A böngészős Credit Chain több forrást egyesíthet (MLC, MusicBrainz), ezért eltérés látható."
          : "Nincs szerzői (songwriter) adat ehhez a felvételhez a batch / opcionális graph válaszában.",
        action:
          "Nyisd meg a credits.fm ISRC oldalt (Credit Chain). Mélyebb API-hoz állítsd be a CREDITS_FM_GRAPH_HYDRATE=true változót (lassabb kérések).",
      });
    }

    return {
      isrc: batch.id,
      title: batch.data?.title ?? null,
      artist: batch.data?.artists?.[0]?.name ?? null,
      iswc: batch.data?.iswc ?? null,
      mlcMatchStatus: unmatched?.match_status ?? "unknown",
      shareTotal: share?.total_share ?? null,
      shareStatus: share?.share_status ?? "missing",
      songwriterCount: batch.data?.songwriters?.length ?? 0,
      publisherCount: batch.data?.publishers?.length ?? 0,
      issues,
      rawBatchData: batch,
    };
  });
}

export function buildAuditSummary(rows: AuditRow[]): AuditSummary {
  return {
    total: rows.length,
    withCriticalIssues: rows.filter((r) =>
      r.issues.some((i) => i.severity === "critical"),
    ).length,
    withIswcMissing: rows.filter((r) => r.iswc == null || r.iswc === "").length,
    withMlcUnmatched: rows.filter((r) => r.mlcMatchStatus === "unmatched").length,
    withIncompleteShares: rows.filter((r) =>
      r.issues.some((i) => i.type === "incomplete_shares"),
    ).length,
    withMissingShares: rows.filter((r) =>
      r.issues.some((i) => i.type === "missing_shares"),
    ).length,
    withMissingIpiMlc: rows.filter((r) =>
      r.issues.some((i) => i.type === "missing_ipi_mlc"),
    ).length,
    withNoSongwriter: rows.filter((r) =>
      r.issues.some((i) => i.type === "no_songwriter"),
    ).length,
    withArtisjusUnmatched: rows.filter((r) => r.artisjusMatched === true).length,
    notFound: rows.filter((r) => r.issues.some((i) => i.type === "not_found")).length,
  };
}
