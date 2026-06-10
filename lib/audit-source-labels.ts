import { CMO_CHIP_LABELS, CMO_SOURCE_IDS, type CmoSourceId } from "@/lib/cmo-types";
import { CMO_WEB_LABELS, type CmoWebSourceId } from "@/lib/cmo-web/web-types";

/** One chip per jogkezelő / collecting society — same logic for ARTISJUS, MLC, AKM, … */
export interface AuditSourceChip {
  id: string;
  label: string;
  count: number;
}

export const AUDIT_HERO_TITLE =
  "Van zenéd, aminek a jogdíja esetleg nem jutott el hozzád?";

export const AUDIT_HERO_SUBTITLE =
  "Írd be, milyen néven szerepelsz a kiadványokon és streamingszolgáltatókon. Megnézzük, szerepelsz-e valamelyik kifizetetlen vagy azonosítatlan listán.";

export const AUDIT_FORM_PLACEHOLDER = "Előadóneved a kiadványokon";

export const AUDIT_FORM_HINT =
  "Ugyanaz a név, amit a daloknál látni szoktál — szóló, zenekar vagy feat-esődj is jó. Nem kell pontosan egyeznie a jogi névvel.";

export const AUDIT_LOADING_MESSAGE =
  "Kifizetetlen és azonosítatlan listákat nézem…";

export const AUDIT_FILTER_PROBLEMS = "Kifizetetlen listán szerepel";

export const AUDIT_FILTER_ALL = "Minden névegyezés";

export const AUDIT_FILTER_HINT =
  "A második fül olyan dalokat is mutat, ahol csak a név hasonlít — nem biztos, hogy a tiéd.";

export const AUDIT_SOURCE_HELP: { label: string; text: string }[] = [
  {
    label: "ARTISJUS (Magyarország)",
    text: "Magyar szerzői jog: lejátszották, de nem tudták kinek utalni (azonosítatlan mű).",
  },
  {
    label: "MLC · unmatched (USA)",
    text: "Amerikai streaming-jogdíj: a bevétel megvan, de a felvétel nincs műhöz kötve.",
  },
  {
    label: "MLC · unclaimed (USA)",
    text: "Ugyanaz a szervezet (The MLC): a mű szerepel, de a mechanikai részesedés nincs claimelve.",
  },
  {
    label: "AKM (Ausztria)",
    text: "Osztrák szerzői jog — azonosítatlan művek listája.",
  },
  {
    label: "AUME (Ausztria)",
    text: "Osztrák mechanikai jog — nem claimelt művek.",
  },
  {
    label: "SENA (Hollandia)",
    text: "Holland szomszédjog — külföldi, nem claimelt felvételek.",
  },
  {
    label: "EJI (Magyarország)",
    text: "Magyar szomszédjog — hiányzó adat miatt nem tudták kifizetni a jogdíjat.",
  },
];

export function buildAuditSourceChips(input: {
  artisjusCount: number;
  mlcUnmatchedCount: number;
  mlcUnclaimedCount: number;
  cmoCounts?: Partial<Record<CmoSourceId, number>>;
  cmoWebCounts?: Partial<Record<CmoWebSourceId, number>>;
  ejiCount?: number;
}): AuditSourceChip[] {
  const chips: AuditSourceChip[] = [];

  if (input.artisjusCount > 0) {
    chips.push({ id: "artisjus", label: "Magyarország · ARTISJUS", count: input.artisjusCount });
  }
  if (input.mlcUnmatchedCount > 0) {
    chips.push({
      id: "mlc-unmatched",
      label: "USA · streaming (unmatched)",
      count: input.mlcUnmatchedCount,
    });
  }
  if (input.mlcUnclaimedCount > 0) {
    chips.push({
      id: "mlc-unclaimed",
      label: "USA · mechanikai (unclaimed)",
      count: input.mlcUnclaimedCount,
    });
  }

  if ((input.ejiCount ?? 0) > 0) {
    chips.push({ id: "eji", label: "Magyarország · EJI", count: input.ejiCount ?? 0 });
  }

  for (const id of CMO_SOURCE_IDS) {
    const count = input.cmoCounts?.[id] ?? 0;
    if (count > 0) {
      chips.push({
        id,
        label: CMO_CHIP_LABELS[id],
        count,
      });
    }
  }

  if (input.cmoWebCounts) {
    for (const [id, count] of Object.entries(input.cmoWebCounts) as [CmoWebSourceId, number][]) {
      if (count > 0) {
        chips.push({ id: `cmo-web-${id}`, label: CMO_WEB_LABELS[id], count });
      }
    }
  }

  return chips;
}

/** Plain-language intro for the results header glossary. */
export const AUDIT_SOURCES_INTRO =
  "Minden jelölés egy jogdíjat kezelő szervezet listáját jelenti. A szám azt mutatja, hány találat jött onnan — nem feltétlenül ennyi külön dal.";

/** @deprecated use AUDIT_FORM_HINT */
export const AUDIT_SEARCH_BLURB = AUDIT_FORM_HINT;

export type AuditSourceCoverageStatus = "found" | "clear" | "skipped" | "unavailable";

export interface AuditSourceCoverageItem {
  id: string;
  label: string;
  status: AuditSourceCoverageStatus;
  count: number;
  detail: string;
}

export function buildAuditSourceCoverage(meta: {
  artisjusCount: number;
  mlcUnmatchedCount: number;
  mlcUnclaimedCount: number;
  cmoCounts?: Partial<Record<CmoSourceId, number>>;
  ejiCount?: number;
  mlcUnmatchedSkipped?: boolean;
  mlcUnclaimedSkipped?: boolean;
  dataBackend?: "local" | "query-api" | "unavailable";
  sourceCapabilities?: {
    catalog: boolean;
    artisjusIndex: boolean;
    cmoIndex: boolean;
  };
}): AuditSourceCoverageItem[] {
  const caps = meta.sourceCapabilities;
  const backendDown = meta.dataBackend === "unavailable";

  function detail(
    status: AuditSourceCoverageStatus,
    count: number,
    skippedReason?: string,
  ): string {
    if (status === "skipped") return skippedReason ?? "Most kihagyva";
    if (status === "unavailable") return "Adatbázis nem elérhető";
    if (status === "found") return `${count} találat`;
    return "Nincs találat";
  }

  function artisjusStatus(): AuditSourceCoverageStatus {
    if (backendDown || caps?.artisjusIndex === false) return "unavailable";
    return meta.artisjusCount > 0 ? "found" : "clear";
  }

  function mlcUnmatchedStatus(): AuditSourceCoverageStatus {
    if (meta.mlcUnmatchedSkipped) return "skipped";
    if (backendDown || caps?.catalog === false) return "unavailable";
    return meta.mlcUnmatchedCount > 0 ? "found" : "clear";
  }

  function mlcUnclaimedStatus(): AuditSourceCoverageStatus {
    if (meta.mlcUnclaimedSkipped) return "skipped";
    if (backendDown || caps?.catalog === false) return "unavailable";
    return meta.mlcUnclaimedCount > 0 ? "found" : "clear";
  }

  function cmoStatus(id: CmoSourceId): AuditSourceCoverageStatus {
    if (backendDown || caps?.cmoIndex === false) return "unavailable";
    const count = meta.cmoCounts?.[id] ?? 0;
    return count > 0 ? "found" : "clear";
  }

  function ejiStatus(): AuditSourceCoverageStatus {
    return (meta.ejiCount ?? 0) > 0 ? "found" : "clear";
  }

  const items: AuditSourceCoverageItem[] = [
    {
      id: "artisjus",
      label: "Magyarország · ARTISJUS (szerzői)",
      status: artisjusStatus(),
      count: meta.artisjusCount,
      detail: detail(artisjusStatus(), meta.artisjusCount),
    },
    {
      id: "eji",
      label: "Magyarország · EJI (szomszédjog)",
      status: ejiStatus(),
      count: meta.ejiCount ?? 0,
      detail: detail(ejiStatus(), meta.ejiCount ?? 0),
    },
    {
      id: "mlc-unmatched",
      label: "USA · MLC streaming (unmatched)",
      status: mlcUnmatchedStatus(),
      count: meta.mlcUnmatchedCount,
      detail: detail(
        mlcUnmatchedStatus(),
        meta.mlcUnmatchedCount,
        "Most kihagyva (lassú lista)",
      ),
    },
    {
      id: "mlc-unclaimed",
      label: "USA · MLC mechanikai (unclaimed)",
      status: mlcUnclaimedStatus(),
      count: meta.mlcUnclaimedCount,
      detail: detail(mlcUnclaimedStatus(), meta.mlcUnclaimedCount, "Kihagyva"),
    },
  ];

  for (const id of CMO_SOURCE_IDS) {
    const status = cmoStatus(id);
    const count = meta.cmoCounts?.[id] ?? 0;
    items.push({
      id,
      label: CMO_CHIP_LABELS[id],
      status,
      count,
      detail: detail(status, count),
    });
  }

  return items;
}
