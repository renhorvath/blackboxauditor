import { CMO_SOURCE_LABELS } from "@/lib/cmo-types";
import type { AuditRow } from "@/lib/types";

export interface SourceFact {
  label: string;
  value: string;
}

export interface SourceDetailBlock {
  id: string;
  region: string;
  sourceLabel: string;
  headline: string;
  facts: SourceFact[];
  action?: string;
}

const FELo_TIP_LABELS: Record<string, string> = {
  SZ: "Szerzői jog",
  NE: "Előadói jog (szomszéd)",
  ME: "Mechanikai jog",
  KA: "Külföldi adó",
  KM: "Külföldi mechanikai",
};

function labelFeloTip(code: string): string {
  return FELo_TIP_LABELS[code.trim().toUpperCase()] ?? code;
}

export function getSourceDetailsForRow(row: AuditRow): SourceDetailBlock[] {
  const blocks: SourceDetailBlock[] = [];

  if (row.artisjusMatched) {
    const facts: SourceFact[] = [];
    if (row.artisjusMukod) facts.push({ label: "Műkód (ARTISJUS)", value: row.artisjusMukod });
    if (row.artisjusFeloTips?.length) {
      facts.push({
        label: "Felosztási típus",
        value: row.artisjusFeloTips.map(labelFeloTip).join(", "),
      });
    }
    if (row.artisjusTopSources?.length) {
      facts.push({
        label: "Honnan jött a lejátszás",
        value: row.artisjusTopSources.slice(0, 5).join(", "),
      });
    }
    if (row.artisjusRowCount != null && row.artisjusRowCount > 1) {
      facts.push({ label: "Érintett sorok", value: `${row.artisjusRowCount} db` });
    }
    blocks.push({
      id: "artisjus",
      region: "Magyarország",
      sourceLabel: "ARTISJUS",
      headline: row.artisjusForeignOnly
        ? "Külföldi adó — nem került magyar kifizetésre"
        : "Lejátszották, de nem tudták kinek utalni",
      facts,
      action: "Regisztráld a művet az ARTISJUS-nál, vagy jelezd az azonosítatlan művet.",
    });
  }

  if (row.mlcMatchStatus === "unmatched") {
    const facts: SourceFact[] = [];
    if (row.mlcProvider) facts.push({ label: "Streaming szolgáltató (DSP)", value: row.mlcProvider });
    if (row.mlcResourceType) facts.push({ label: "Felvétel típusa", value: row.mlcResourceType });
    if (row.isrc && !row.isrc.startsWith("artisjus:") && !row.isrc.startsWith("cmo:")) {
      facts.push({ label: "ISRC", value: row.isrc });
    }
    blocks.push({
      id: "mlc-unmatched",
      region: "USA",
      sourceLabel: "MLC · unmatched",
      headline: "A streaming bevétel megvan, de a felvétel nincs műhöz kötve",
      facts,
      action: "Regisztrálj az MLC-nél (themlc.com), vagy kérd az ARTISJUS reciprocity igénylését.",
    });
  }

  if (row.mlcUnclaimed) {
    const facts: SourceFact[] = [];
    if (row.mlcUnclaimedPct != null) {
      facts.push({ label: "Claim nélküli részesedés", value: `${row.mlcUnclaimedPct}%` });
    }
    if (row.mlcWorkRecordId) facts.push({ label: "Műkód (MLC)", value: row.mlcWorkRecordId });
    if (row.mlcDspResourceId) facts.push({ label: "DSP azonosító", value: row.mlcDspResourceId });
    if (row.isrc && !row.isrc.startsWith("artisjus:") && !row.isrc.startsWith("cmo:")) {
      facts.push({ label: "ISRC", value: row.isrc });
    }
    blocks.push({
      id: "mlc-unclaimed",
      region: "USA",
      sourceLabel: "MLC · unclaimed",
      headline: "Mechanikai jogdíj összegyűlt, de nincs regisztrált tulajdonos (black box)",
      facts,
      action: "Regisztráld a művet és a share-eket az MLC Member Portalon.",
    });
  }

  for (const hit of row.cmoHits ?? []) {
    const facts: SourceFact[] = [
      { label: "Mű / felvétel címe", value: hit.title },
    ];
    if (hit.identification) facts.push({ label: "Előadó a listán", value: hit.identification });
    if (hit.recordId) facts.push({ label: "CMO azonosító", value: hit.recordId });
    if (hit.remark) facts.push({ label: "Megjegyzés", value: hit.remark });
    if (hit.senaRole === "producenten") facts.push({ label: "Jog típusa", value: "Producenti jog" });
    if (hit.senaRole === "muzikanten") facts.push({ label: "Jog típusa", value: "Előadói jog" });

    const orgLabel = CMO_SOURCE_LABELS[hit.source].replace(" (AT)", "").replace(" (NL)", "");
    const region =
      hit.source === "nl-sena" ? "Hollandia" : hit.source.startsWith("at-") ? "Ausztria" : "Külföld";

    blocks.push({
      id: `cmo-${hit.source}-${hit.recordId}`,
      region,
      sourceLabel: orgLabel,
      headline:
        hit.source === "at-aume"
          ? "Mechanikai jog nem claimelt (Ausztria)"
          : hit.source === "nl-sena"
            ? "Külföldi felvétel nem claimelt (Hollandia)"
            : "Azonosítatlan mű az osztrák listán",
      facts,
      action: `Ellenőrizd a ${CMO_SOURCE_LABELS[hit.source]} regisztrációt és claim lehetőséget.`,
    });
  }

  return blocks;
}

export function laymanSummaryForRow(row: AuditRow): string {
  const blocks = getSourceDetailsForRow(row);
  if (blocks.length === 0) return "Ezen a forrásokon nem találtunk problémát.";
  return blocks.map((b) => `${b.region}: ${b.headline}`).join(" · ");
}
