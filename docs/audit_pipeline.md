# Automatizált audit pipeline — blueprint

> Ez a dokumentum a SNYL / Topa Ferenc kézi auditból visszafejtett, általánosított
> audit-folyamat terve. Cél: egy `audit(seed)` motor, amely tetszőleges előadóra
> lefuttatja ugyanazt, amit a SNYL-en kézzel végigcsináltunk.
>
> Társdokumentumok: `docs/cisac_probe_findings.md` (CISAC ISWCnet API),
> `docs/ui_ab_roadmap.md` (A×B UI integráció), `docs/recovery_case_model.md` (master RecoveryCase).

## 1. A gerinc: `ArtistContext` + 4 join-kulcs

Minden erre épül. Az `ArtistContext` az egyetlen állapot, amit fokozatosan töltünk fel,
és 4 kulcs köti össze a "felvétel-világot" a "jogvilággal":

| Kulcs | Honnan | Szerep |
|-------|--------|--------|
| **ISRC** | Spotify katalógus | felvétel-azonosító |
| **ISWC** | credits.fm / CISAC | mű-azonosító |
| **IPI** (name number) | credits.fm / CISAC / MLC | **a HÍD** a felvétel- és jogvilág közt |
| **cím + név** (normalizált) | minden forrás | fuzzy fallback join |

Az **IPI a linchpin**: a felvételi oldal (Spotify/ISRC) és a jog/mű oldal
(CISAC/Artisjus/MLC) csak a személyen (IPI) keresztül köthető össze tisztán —
vagy fuzzy cím+név egyezéssel.

```python
@dataclass
class ArtistContext:
    slug: str
    spotify_id: str | None = None
    aliases: list[str] = field(default_factory=list)        # "SNYL", "Snail Y"
    exclude_aliases: list[str] = field(default_factory=list) # "Mr. Bizz" (külön előadó!)
    legal_name: str | None = None                            # "Topa Ferenc" (writer-szavazás)
    ipi: str | None = None                                   # "00518140870"
    iswc_net: list[tuple[str, str]] = field(default_factory=list)
    data_dir: Path | None = None                             # data/artists/{slug}/
```

## 2. A pipeline — 7 fázis

```
SEED (operator: Spotify URL | név | IPI | katalógus CSV | bbox link)
   │
   ▼
[0] IDENTITY RESOLUTION  (az egyetlen kötelező, félig-emberi lépés)
   │     két passzban (lásd lent), konfidencia-gate → wizard ha bizonytalan
   ▼
[1] CATALOG (felvétel)            [2] RIGHTS/WORK (mű)
   Spotify scrape                    credits.fm  ISWC + writer
   + scope-szűrő (Mr. Bizz)          MLC works   song code + share
   + Beatport / GVL / MB             CISAC searchByIpi → TELJES ISWC katalógus
                                     Artisjus index
   │
   ▼
[3] BLACK BOX / UNMATCHED INGEST
   bbox findings + MLC unmatched scan + Artisjus unmatched + EJI
   │
   ▼
[4] CONSOLIDATION → mű-bucketek (join a 4 kulcson, dedup)
   │
   ▼
[5] GAP ANALYSIS → priority (P0-P2), gap_score, teendő, impact_tier
   │
   ▼
[6] RECOVERY + RENDER
   pre-fill (EJI adatlap), claim-csomag
   3 nézet: artist (lágy) / manager (by_work) / ops (nyers)
```

## 3. Fázis 0 — identity resolution két passzban

Csirke-tojás probléma: az IPI title-kereséshez **címek** kellenek, a címek a
katalógusból jönnek. Ezért:

```
1. passz: minimál identitás a seedből (spotify_id, művésznév)
        → [1] katalógus scrape (címek + ISRC-k)
2. passz: jogi név levezetése (writer-szavazás a credits.fm/MLC writer-nevekből)
        → IPI felderítés (kaszkád, lásd lent)
        → CISAC searchByIpi a teljes ISWC-katalógusért
```

### IPI-felderítés kaszkád (olcsó → drága)

1. 🟢 `ctx.ipi` ha már adott (operator megadta)
2. 🟢 **credits.fm writer IPI** (ISRC-ből)
3. 🟢 **CISAC `searchByIswc`** (bármely ismert ISWC-ből) → `interestedParties[].nameNumber`
4. 🟡 **MLC writer-zárójel** — opportunista, gyakran hiányzik
5. 🟡 **Artisjus jogosultak**
6. 🟡 **CISAC `searchByTitleAndContributor` + szavazás** — cold-start fallback

**Kereszt-ellenőrzés:** ha két független forrás ugyanazt az IPI-t adja → magas
konfidencia, auto. Ha eltérnek vagy csak egy forrás ad találatot → **identity wizard**.

### A jogi név is levezethető

A művésznév (SNYL) ≠ jogi név (Topa Ferenc). A CISAC/Artisjus a **jogi néven**
indexel. Megoldás: az a writer-név, amely az előadó **saját trackjein** újra meg
újra előjön (credits.fm/MLC writer-listák), az a jogi név — ugyanaz a szavazós logika,
mint az IPI-nél.

### Konfidencia-gate-ek (a gép sehol ne találgasson)

| Döntés | Auto, ha… | Különben |
|--------|-----------|----------|
| IPI elfogadás | egy name-number ≥N címen szavazatot kap | wizard: jelöltek listája |
| alias szűrés | nincs ütközés az exclude-listával | wizard megerősítés (Mr. Bizz) |
| work↔recording join | ISRC vagy IPI egyezés | fuzzy cím+név, alacsony konfidencia jelölve |

## 4. Minimális input (tiered)

| Szint | Operator ad | Flow |
|-------|-------------|------|
| 0 (cold) | csak előadónév | Spotify-keresés → wizard → tovább |
| **1 (ajánlott min.)** | **Spotify artist URL** | teljesen automatikus bootstrap |
| 2 (gyorsított) | + jogi név és/vagy IPI | felderítés kihagyva, magasabb konfidencia |
| 3 (gazdag) | + bbox link + katalógus CSV | legtöbb adat, legkevesebb API-hívás |

**Ajánlott minimum: 1 Spotify artist URL.** Minden más levezethető belőle. Streaming
nélküli katalógusnál (régi/fizikai kiadások) a **jogi név + címlista** az elsődleges belépő.

## 5. Keresztmetszeti réteg: normalizálás

Visszatérő téma (Mr. Bizz, bbox HTML-entitások, CISAC névformátum). **Egy megosztott
modul** szolgálja ki az összes join-t és fuzzy matchet:

- **nevek**: ékezet le, kötőjel→szóköz, uppercase, vezetéknév-tokenek
  (CISAC: `Szendrey-Nagy Olivér` → `SZENDREY NAGY`) — lásd probe findings
- **címek**: parent/base cím (`base_work()`), HTML-unescape, remix/mix suffix le
- **ISRC/ISWC/IPI**: kanonikus forma

## 6. Caching / névtér

`data/artists/{slug}/` — a feloldott `ctx` (IPI, jogi név, aliasok) és minden output
ide. Egy előadó egyszer feloldva nem futtatja újra a drága felderítést → ez teszi
gyorssá az ops-eszközt több előadóra.

## 7. Meglévő kód → fázis-leképezés

| Fázis | Meglévő scriptek |
|-------|------------------|
| 0 (IPI felderítés) | `scripts/cisac/iswc_client.py` + új `resolve_ipi.py` (tervezett) |
| 1 (katalógus) | Spotify scrape (ad-hoc job), `scripts/snyl_scope.py` (Mr. Bizz szűrő), `scripts/beatport/*` |
| 2 (mű enrichment) | `scripts/mlc/fetch_topa_mlc_works.py`, credits.fm, `scripts/cisac/iswc_client.py` |
| 3 (unmatched) | bbox findings CSV, `scripts/mlc/scan_tsv_by_artist.py` |
| 4 (konszolidáció) | `scripts/snyl_consolidate.py` |
| 5 (gap) | `scripts/snyl_actionable_gaps.py` |
| 6 (recovery) | `scripts/snyl_eji_resolution.py` |

A hiányzó "ragasztó": `ArtistContext` + normalizálás-modul + `resolve_ipi` + CLI.

### SNYL scriptek = golden referencia, nem terméknév

A `scripts/snyl_*.py` és a `data/snyl_*` outputok a **SNYL / Topa Ferenc pilot**
kézi auditjából származnak — mintázat és golden file (pl. `Topa → IPI 00518140870`).
**További fejlesztésben nem SNYL-specifikusnak kell maradniuk:** a cél a
`data/artists/{slug}/` névtér, `ArtistContext` (aliasok, `exclude_aliases`, jogi név),
és az `engine.py` / `audit_cli.py` általános motor. A SNYL-ben tanult minták
(pl. Mr. Bizz alias-szűrő → `exclude_aliases`) általánosítandók; a fájlnevek
átnevezése későbbi refaktor, amíg a golden diff működik.

## 8. Javasolt build-sorrend (golden-file háló köré)

1. **Normalizálás-modul** + `ArtistContext` — minden más erre épül.
2. **`engine.py`** (consolidate + gaps kiemelve a SNYL-scriptekből) — SNYL golden-teszt.
3. **`resolve_ipi.py`** (CISAC title-search + szavazás + normalizálás) — golden: `Topa → 518140870`.
4. **`sources/*` egységesítése** közös interfészre.
5. **`audit_cli.py`** — `audit <seed>` végigvezeti a 0–5 fázist.
6. **Recovery + 3 nézet** renderelés.

Az 1–3 a kritikus mag; a SNYL-output mindenhol a referencia (golden file).

## 9. Termék-rétegek (3 nézet, egy pipeline)

- **artist-view** — lágy, dal-szintű, „mit tehetsz / mit intézünk mi"
- **manager-view** — `snyl_actionable_by_work.csv` szint (portfólió)
- **ops-view** — nyers `snyl_actionable_gaps.csv` (belső)

Recovery path = a differenciátor: nem áll meg a diagnózisnál, hanem **kitölti a
beadványt** (EJI adatlap pre-fill már bizonyított; általánosítható más CMO-űrlapokra).
