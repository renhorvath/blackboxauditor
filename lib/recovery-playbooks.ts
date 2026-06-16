import type { PlaybookEntry } from "@/lib/recovery-types";
import { toPlaybookSnapshot } from "@/lib/recovery-types";

import deGvlKonu from "@/lib/recovery-playbooks-data/de.gvl.konu.json";
import deGvlListenArtist from "@/lib/recovery-playbooks-data/de.gvl.listen_artist.json";
import deGvlListenProducer from "@/lib/recovery-playbooks-data/de.gvl.listen_producer.json";
import deGvlSendemeldung from "@/lib/recovery-playbooks-data/de.gvl.sendemeldung.json";
import huArtisjus from "@/lib/recovery-playbooks-data/hu.artisjus.unidentified_work.json";
import huEji from "@/lib/recovery-playbooks-data/hu.eji.unidentified.json";
import nlSenaPerformer from "@/lib/recovery-playbooks-data/nl.sena.performer.json";
import nlSenaProducent from "@/lib/recovery-playbooks-data/nl.sena.producent.json";
import usMlcUnclaimed from "@/lib/recovery-playbooks-data/us.mlc.unclaimed_share.json";
import usMlcUnmatched from "@/lib/recovery-playbooks-data/us.mlc.unmatched_recording.json";

const PLAYBOOKS: Record<string, PlaybookEntry> = {
  [deGvlKonu.id]: deGvlKonu as PlaybookEntry,
  [deGvlListenArtist.id]: deGvlListenArtist as PlaybookEntry,
  [deGvlListenProducer.id]: deGvlListenProducer as PlaybookEntry,
  [deGvlSendemeldung.id]: deGvlSendemeldung as PlaybookEntry,
  [huArtisjus.id]: huArtisjus as PlaybookEntry,
  [huEji.id]: huEji as PlaybookEntry,
  [nlSenaPerformer.id]: nlSenaPerformer as PlaybookEntry,
  [nlSenaProducent.id]: nlSenaProducent as PlaybookEntry,
  [usMlcUnclaimed.id]: usMlcUnclaimed as PlaybookEntry,
  [usMlcUnmatched.id]: usMlcUnmatched as PlaybookEntry,
};

export { toPlaybookSnapshot };

export function getPlaybook(id: string): PlaybookEntry | undefined {
  return PLAYBOOKS[id];
}

export function listPlaybooks(): PlaybookEntry[] {
  return Object.values(PLAYBOOKS);
}

export function playbookIds(): string[] {
  return Object.keys(PLAYBOOKS);
}
