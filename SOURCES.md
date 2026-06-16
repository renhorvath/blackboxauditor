# Data sources catalog

Local raw files live under `raw/` — never committed to git. See `DATA_SETUP.md` for env vars.

## CMO unidentified / unclaimed lists (Europe)

| Path | Organization | Country | Rights type | Format | ~Rows | App status |
|------|--------------|---------|-------------|--------|-------|------------|
| `raw/cmo/hu-artisjus/artisjus_azonositatlan_muvek_2025.csv` | **ARTISJUS** | HU | Musical works (authors/publishers) | CSV | 785k lines / 188k works | ✅ Indexed (`npm run artisjus:build-index`) |
| `raw/cmo/at-akm/Anfrageliste-AKM-allgemein.xlsx` | **AKM** | AT | Musical works (Anfrageliste) | XLSX | 25k | ✅ Indexed (`npm run cmo:build-index`) |
| `raw/cmo/at-aume/Anfrageliste-aume-allgemein.xlsx` | **Austro-Mechana** | AT | Mechanical rights | XLSX | 7k | ✅ Indexed |
| `raw/cmo/nl-sena/ongeclaimd-nederland.xlsx` | **SENA** | NL | Neighbouring — domestic unclaimed | XLSX | ~43k + ~47k | ✅ Indexed |
| `raw/cmo/nl-sena/ongeclaimd-buitenland.xlsx` | **SENA** | NL | Neighbouring — foreign unclaimed | XLSX | ~150k × 2 sheets | ✅ Indexed |
| `raw/cmo/se-stim/*.xlsx` | **STIM** | SE | Musical works (quarterly) | XLSX | ~188k | ✅ Indexed — `npm run cmo:fetch -- --source se-stim` |
| `raw/cmo/sk-soza/*.xlsx` | **SOZA** | SK | Musical works (annual) | XLSX | varies | ✅ Indexed |
| `raw/cmo/ro-credidam/*.xlsx` | **CREDIDAM** | RO | Neighbouring — radio/TV | XLSX | varies | ✅ Indexed |
| `raw/cmo/hr-hds-zamp/*.xlsx` | **HDS-ZAMP** | HR | Musical works (3 files) | XLSX | varies | ✅ Indexed — **manuális letöltés** (`zamp.hr/press/download/pregled` → HTTP 403 botnak) |
| `raw/cmo/ro-ucmr-ada/*.csv` | **UCMR-ADA** | RO | Musical works (PDF→CSV) | CSV | monthly | ✅ Optional — `parse_ucmr_pdf.py` |
| `raw/cmo/ee-eau/*.csv` | **EAÜ** | EE | Musical works | CSV | varies | ⚠️ Indexed — **manuális CSV** from [eau.org](https://eau.org) (not `.ee`); `npm run cmo:fetch-eau` |
| `raw/cmo/ee-eel/*.xlsx` | **EEL** | EE | Neighbouring | XLSX | varies | ✅ Indexed |
| `raw/cmo/cz-intergram/*.xlsx` | **INTERGRAM** | CZ | Neighbouring | XLSX | varies | ✅ Indexed |
| `raw/cmo/fi-gramex/*.xlsx` | **Gramex** | FI | Neighbouring | XLSX | ~51k | ✅ Indexed — [unidentified plays](https://www.gramex.fi/en/unidentified-plays-phonograms/); `npm run cmo:fetch -- --source fi-gramex` |
| `raw/cmo/de-gvl/` | **GVL** | DE | Neighbouring — listen + KONU + Sendemeldungen | XLSX + PDF | ~1.1M | ✅ Indexed — symlink `~/Downloads/gvl` → `raw/cmo/de-gvl`; Verteiljahr ≤2023 |

### Web adapters (phase 3)

| Source | Country | Env | Cache |
|--------|---------|-----|-------|
| ZAiKS | PL | `CMO_WEB_ENABLED` | `derived/cmo-web-cache/zaiks/` |
| SACEM ONI | FR | same | `.../sacem/` |
| SPEDIDAM ILAD | FR | same | `.../spedidam/` |
| SAMI | SE | same | `.../sami/` |
| KODA | DK | same | `.../koda/` |

Phase 4 stubs (PRS, SGAE, BUMA): `scripts/cmo/pending/README.md`

### Column schemas

**ARTISJUS:** `ssz, mukod, mucim, eloadok, jogosultak, zenemu_kiado, hangfelvetel_kiado, felo_tip, elhangzasi_info`

**AKM / AUME:** `Werknummer, Werktitel, Identifikation, Vermerk` (bilingual header cells)

**SENA:** `Recording ID, Main artist, Title, Version, ISRC` — sheets `Producenten`, `Muzikanten` (both nederland + buitenland files)

**GVL listen:** `Name, Vorname, Ort` (artists) or `Name, Ort/City` (producers) — metadata rows 1–6, header row 8

**GVL KONU:** `Produktionsnummer, Produktionstitel, Zusätzliche Titelinformationen (remix), Hauptinterpret, ISRC, Label` — `produktionen_2022|2023/KONU_*.xlsx`

**GVL Sendemeldungen:** PDF → `derived/cmo/de-gvl/sendemeldungen/*.csv` (egyszeri: `npm run cmo:gvl-extract-sendemeldungen`; utána az index build CSV-ből olvas, nem PDF-ből)

> **Note:** AKM and AUME are *author/mechanical* societies, not performer rights (LSG handles performers in Austria). SENA is *neighbouring rights*, not BUMA/STEMRA (Dutch authors).

## MLC (USA — BWARM v2)

| Path | File | Size | Purpose |
|------|------|------|---------|
| `raw/mlc/unmatchedresources.tsv` | Unmatched recordings | ~113 GB | Artist audit — `MLC_UNMATCHED_TSV` |
| `raw/mlc/unclaimedmusicalworkrightshares.tsv` | Unclaimed work shares | ~7.6 GB | Artist audit — `MLC_UNCLAIMED_TSV` |

## Exports (generated)

| Path | Description |
|------|-------------|
| `exports/jazzbois_matches.csv` | Sample MLC unclaimed search result |

## Research documents

| Path | Description |
|------|-------------|
| `docs/research/European_CMO_Unidentified_Works_Registry_Report_Corrected.docx` | CRM Art. 13 compliance mapping (62 CMOs, June 2026) |
| `docs/research/European_CMO_Unidentified_Works_Registry_Report_Corrected.txt` | Plain-text extract for tooling / agents |
| `docs/recovery/TEMPLATE.md` | Recovery playbook research template |
| `music-metadata-audit-projekt-riport.md` | Project context (HU) |

## Recovery playbooks (committed)

| Path | Description |
|------|-------------|
| `data/recovery-playbooks/*.json` | Org-specific claim process (ARTISJUS, MLC, GVL, SENA, EJI) — loaded by `lib/recovery-playbooks.ts` |

## Published reports (Neon)

Snapshots are stored in Neon Postgres (`DATABASE_URL`), not on disk. Publish from local audit UI or `npm run batch:artist-audit -- --publish "Artist"`.

## Env vars (this machine)

```env
MLC_UNMATCHED_TSV=./raw/mlc/unmatchedresources.tsv
MLC_UNCLAIMED_TSV=./raw/mlc/unclaimedmusicalworkrightshares.tsv
ARTISJUS_CSV_PATH=./raw/cmo/hu-artisjus/artisjus_azonositatlan_muvek_2025.csv
MLC_HU_DATA_DIR=./derived/mlc-hu
ARTISJUS_INDEX_PATH=./data/artisjus-index.json
CMO_INDEX_PATH=./data/cmo-index.json
# CMO_GVL_INDEX_PATH=./data/cmo-gvl-index.json
DATABASE_URL=postgresql://...
PUBLISH_API_KEY=...
OPERATOR_SECRET=...
REPORT_PUBLIC_BASE_URL=https://your-app.vercel.app
MLC_SCAN_RACE_MS=600000
```

Index build:

```bash
npm run artisjus:build-index
npm run cmo:bootstrap    # placeholder XLSX/CSV when raw/ missing (dev)
npm run cmo:fetch        # STIM, SOZA, Gramex, HDS-ZAMP, EEL, INTERGRAM
npm run cmo:fetch-eau    # EAÜ CSV (often needs manual export)
npm run cmo:build-index
python3 scripts/cmo/parse_ucmr_pdf.py path/to/ucmr.pdf   # RO UCMR-ADA
```
