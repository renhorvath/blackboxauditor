# Recovery Case modell — master gap forrás

> Társdokumentumok: `docs/audit_pipeline.md`, `docs/ui_ab_roadmap.md`
>
> Cél: egy **RecoveryCase** réteg, amiből minden CMO recovery út (EJI adatlap, GVL
> Mitwirkungsmeldung, ARTISJUS, MLC, …) ugyanazokból a **CanonicalFacts** mezőkből
> táplálkozik — adapterekkel, nem ismételt A+B join-nal.

---

## 1. Három réteg

| Réteg | Felelősség | Példa fájl |
|-------|------------|------------|
| **RecoveryCase** (master) | A+B+gap → egy recovery lehetőség | `data/artists/{slug}/cases.json` |
| **Playbook** | *Hogyan* és *hol* adom be | `lib/recovery-playbooks-data/*.json` |
| **Adapter** | CanonicalFacts → CMO űrlap | `scripts/recovery/adapters/eji.ts` (terv) |

```
AuditRow[] / engine gaps
        │
        ▼
  buildRecoveryCases()
        │
        ▼
  RecoveryCase[]  ──► cases.json
        │
        ├──► computeRecoveryTargets()  (missing mezők / ready)
        │
        └──► adapters (EJI XLS, GVL CSV, …)
```

---

## 2. Típusok

### CanonicalFacts — CMO-semleges alap infó

| Kulcs | Jelentés | Honnan (ma) |
|-------|----------|-------------|
| `title` | dal / mű cím | `AuditRow.title` |
| `performerName` | előadó a listán | `AuditRow.artist` |
| `legalName` | jogi név szerzőként | `ArtistContext` (később) |
| `isrc` | felvétel azonosító | `AuditRow.isrc` |
| `iswc` | mű azonosító | `AuditRow.iswc` |
| `releaseYear` | megjelenés éve | katalógus (később) |
| `label` | kiadó | katalógus / hit |
| `mainArtist` | fő előadó | `artist` vagy katalógus |
| `writers` | szerzők | MLC / credits.fm (később) |
| `produktionsnummer` | GVL produkció szám | `cmoHits` GVL |
| `artisjusMukod` | ARTISJUS műkód | `artisjusMukod` |
| `mlcSongCode` | MLC song code | batch data (később) |

### BlackboxHit — B oldal hivatkozás

Egy konkrét lista-bejegyzés: forrás, rekord ID, playbook.

### RecoveryTarget — playbook × kitölthetőség

| Mező | Jelentés |
|------|----------|
| `playbookId` | pl. `hu.eji.unidentified` |
| `status` | `ready` \| `partial` \| `blocked` |
| `missingFields` | hiányzó `CanonicalKey` lista |
| `filledFields` | meglevő canonical kulcsok |

### RecoveryCase — master rekord

Egy **finding** (dal/mű szint): `facts` + `blackboxHits[]` + `gap` + `recoveryTargets[]`.

---

## 3. Build fázisok (implementáció)

| Fázis | Mit ad | Teszt |
|-------|--------|-------|
| **1** ✅ | típusok + `AuditRow` → `RecoveryCase` + export script | `npm run recovery:export-cases -- "Név"` |
| **2** | playbook `canonicalKey` mapping bővítés, EJI adapter váz | `cases.json` → `eji_ready.csv` |
| **3** | Python `engine` → ugyanaz a schema (`cases.json`) | SNYL golden diff |
| **4** | UI ops: case lista, export gombok | `?ops=1` |
| **5** | publish snapshot `recoveryTargets` | `/r/token` státusz |

---

## 4. Fájlok (Fázis 1)

```
lib/recovery-case/
  types.ts              # CanonicalFacts, RecoveryCase, …
  canonical-keys.ts     # playbook → required canonical keys
  facts-from-row.ts     # AuditRow → CanonicalFacts
  blackbox-from-row.ts  # AuditRow → BlackboxHit[]
  compute-targets.ts    # facts + playbook → RecoveryTarget
  build-cases.ts        # orchestráció
  artist-slug.ts        # név → slug

scripts/recovery/
  export_cases.mts      # audit + cases.json írás
```

---

## 5. SNYL scriptek szerepe

- `snyl_actionable_gaps.csv` → proto wide master (Fázis 3 golden)
- `snyl_eji_resolution.py` → EJI adapter referencia (Fázis 2)
- Output path cél: `data/artists/{slug}/` (nem `data/snyl_*`)

---

## 6. Playbook requiredData → canonicalKey

A playbook JSON `requiredData[].field` emberi címke maradhat; a motor a
`canonical-keys.ts` táblázatból tudja, melyik **CanonicalKey** kell hozzá.

Később: `requiredData[].canonicalKey` közvetlenül a JSON-ban.
