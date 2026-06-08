import type { CmoSourceId } from "@/lib/cmo-types";
import { CMO_SOURCE_LABELS } from "@/lib/cmo-types";

/** One chip per jogkezelő / collecting society — same logic for ARTISJUS, MLC, AKM, … */
export interface AuditSourceChip {
  id: string;
  label: string;
  count: number;
}

export const AUDIT_SOURCE_HELP: { label: string; text: string }[] = [
  {
    label: "ARTISJUS (Magyarország)",
    text: "Magyar jogkezelő: lejátszották, de nem tudták kinek utalni (azonosítatlan mű).",
  },
  {
    label: "MLC · unmatched (USA)",
    text: "Amerikai mechanikai jogdíj-központ: a streaming bevétel megvan, de a felvétel nincs műhöz kötve.",
  },
  {
    label: "MLC · unclaimed (USA)",
    text: "Ugyanaz a szervezet (The MLC): a mű szerepel, de a mechanikai részesedés nincs claimelve (black box).",
  },
  {
    label: "AKM (Ausztria)",
    text: "Osztrák szerzői jogkezelő — azonosítatlan művek listája (Anfrageliste).",
  },
  {
    label: "AUME (Ausztria)",
    text: "Austro-Mechana — mechanikai jog, nem claimelt művek.",
  },
  {
    label: "SENA (Hollandia)",
    text: "Holland szomszédjogi kezelő — külföldi, nem claimelt felvételek.",
  },
  {
    label: "EJI (Magyarország)",
    text: "Magyar szomszédjogi kezelő — jogosultkutatás: hiányzó adat miatt nem tudták kifizetni a jogdíjat.",
  },
];

export function buildAuditSourceChips(input: {
  artisjusCount: number;
  mlcUnmatchedCount: number;
  mlcUnclaimedCount: number;
  cmoCounts?: Partial<Record<CmoSourceId, number>>;
  ejiCount?: number;
}): AuditSourceChip[] {
  const chips: AuditSourceChip[] = [];

  if (input.artisjusCount > 0) {
    chips.push({ id: "artisjus", label: "ARTISJUS", count: input.artisjusCount });
  }
  if (input.mlcUnmatchedCount > 0) {
    chips.push({
      id: "mlc-unmatched",
      label: "MLC · unmatched",
      count: input.mlcUnmatchedCount,
    });
  }
  if (input.mlcUnclaimedCount > 0) {
    chips.push({
      id: "mlc-unclaimed",
      label: "MLC · unclaimed",
      count: input.mlcUnclaimedCount,
    });
  }

  if ((input.ejiCount ?? 0) > 0) {
    chips.push({ id: "eji", label: "EJI", count: input.ejiCount ?? 0 });
  }

  const cmoOrder: CmoSourceId[] = ["at-akm", "at-aume", "nl-sena"];
  for (const id of cmoOrder) {
    const count = input.cmoCounts?.[id] ?? 0;
    if (count > 0) {
      chips.push({
        id,
        label: CMO_SOURCE_LABELS[id].replace(" (AT)", "").replace(" (NL)", ""),
        count,
      });
    }
  }

  return chips;
}

/** Plain-language intro for the results header glossary. */
export const AUDIT_SOURCES_INTRO =
  "Minden chip egy jogdíjat kezelő szervezet (CMO / collecting society). Az ARTISJUS a magyar szerzői, az EJI a magyar szomszédjogi kezelő; az MLC az amerikai mechanikai központ; az AKM, AUME és SENA külföldi listáink.";

/** Homepage / search helper copy — no fake „európai CMO” bucket. */
export const AUDIT_SEARCH_BLURB =
  "Az ARTISJUS, EJI, MLC (USA), AKM, AUME és SENA listáiban / jogosultkutatásában keresünk.";
