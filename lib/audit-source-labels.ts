import type { CmoSourceId } from "@/lib/cmo-types";

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

  const cmoChipLabels: Record<CmoSourceId, string> = {
    "at-akm": "Ausztria · AKM",
    "at-aume": "Ausztria · AUME",
    "nl-sena": "Hollandia · SENA",
  };
  const cmoOrder: CmoSourceId[] = ["at-akm", "at-aume", "nl-sena"];
  for (const id of cmoOrder) {
    const count = input.cmoCounts?.[id] ?? 0;
    if (count > 0) {
      chips.push({
        id,
        label: cmoChipLabels[id],
        count,
      });
    }
  }

  return chips;
}

/** Plain-language intro for the results header glossary. */
export const AUDIT_SOURCES_INTRO =
  "Minden jelölés egy jogdíjat kezelő szervezet listáját jelenti. A szám azt mutatja, hány találat jött onnan — nem feltétlenül ennyi külön dal.";

/** @deprecated use AUDIT_FORM_HINT */
export const AUDIT_SEARCH_BLURB = AUDIT_FORM_HINT;
