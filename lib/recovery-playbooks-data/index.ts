import type { PlaybookEntry } from "@/lib/recovery-types";

import atAkm from "./at.akm.unidentified_work.json";
import atAume from "./at.aume.mechanical.json";
import czIntergram from "./cz.intergram.unidentified_work.json";
import deGvlKonu from "./de.gvl.konu.json";
import deGvlListenArtist from "./de.gvl.listen_artist.json";
import deGvlListenProducer from "./de.gvl.listen_producer.json";
import deGvlSendemeldung from "./de.gvl.sendemeldung.json";
import eeEau from "./ee.eau.unidentified_work.json";
import eeEel from "./ee.eel.unidentified_work.json";
import fiGramex from "./fi.gramex.unidentified_work.json";
import hrHdsZamp from "./hr.hds_zamp.unidentified_work.json";
import huArtisjus from "./hu.artisjus.unidentified_work.json";
import huEji from "./hu.eji.unidentified.json";
import nlSenaPerformer from "./nl.sena.performer.json";
import nlSenaProducent from "./nl.sena.producent.json";
import roCredidam from "./ro.credidam.unidentified_work.json";
import roUcmrAda from "./ro.ucmr_ada.unidentified_work.json";
import seStim from "./se.stim.unidentified_work.json";
import skSoza from "./sk.soza.unidentified_work.json";
import usMlcUnclaimed from "./us.mlc.unclaimed_share.json";
import usMlcUnmatched from "./us.mlc.unmatched_recording.json";

export const PLAYBOOK_ENTRIES: PlaybookEntry[] = [
  atAkm,
  atAume,
  czIntergram,
  deGvlKonu,
  deGvlListenArtist,
  deGvlListenProducer,
  deGvlSendemeldung,
  eeEau,
  eeEel,
  fiGramex,
  hrHdsZamp,
  huArtisjus,
  huEji,
  nlSenaPerformer,
  nlSenaProducent,
  roCredidam,
  roUcmrAda,
  seStim,
  skSoza,
  usMlcUnclaimed,
  usMlcUnmatched,
] as PlaybookEntry[];
