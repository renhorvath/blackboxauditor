# Data sources catalog

Local raw files live under `raw/` — never committed to git. See `DATA_SETUP.md` for env vars.

## CMO unidentified / unclaimed lists (Europe)

| Path | Organization | Country | Rights type | Format | ~Rows | App status |
|------|--------------|---------|-------------|--------|-------|------------|
| `raw/cmo/hu-artisjus/artisjus_azonositatlan_muvek_2025.csv` | **ARTISJUS** | HU | Musical works (authors/publishers) | CSV | 785k lines / 188k works | ✅ Indexed (`npm run artisjus:build-index`) |
| `raw/cmo/at-akm/Anfrageliste-AKM-allgemein.xlsx` | **AKM** | AT | Musical works (Anfrageliste) | XLSX | 25k | ✅ Indexed (`npm run cmo:build-index`) |
| `raw/cmo/at-aume/Anfrageliste-aume-allgemein.xlsx` | **Austro-Mechana** | AT | Mechanical rights | XLSX | 7k | ✅ Indexed |
| `raw/cmo/nl-sena/ongeclaimd-buitenland.xlsx` | **SENA** | NL | Neighbouring rights (Producenten + Muzikanten) | XLSX | 150k × 2 sheets | ✅ Indexed |

### Column schemas

**ARTISJUS:** `ssz, mukod, mucim, eloadok, jogosultak, zenemu_kiado, hangfelvetel_kiado, felo_tip, elhangzasi_info`

**AKM / AUME:** `Werknummer, Werktitel, Identifikation, Vermerk` (bilingual header cells)

**SENA:** `Recording ID, Main artist, Title, Version, ISRC` — sheets `Producenten`, `Muzikanten`

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
| `music-metadata-audit-projekt-riport.md` | Project context (HU) |

## Env vars (this machine)

```env
MLC_UNMATCHED_TSV=./raw/mlc/unmatchedresources.tsv
MLC_UNCLAIMED_TSV=./raw/mlc/unclaimedmusicalworkrightshares.tsv
ARTISJUS_CSV_PATH=./raw/cmo/hu-artisjus/artisjus_azonositatlan_muvek_2025.csv
MLC_HU_DATA_DIR=./derived/mlc-hu
ARTISJUS_INDEX_PATH=./data/artisjus-index.json
CMO_INDEX_PATH=./data/cmo-index.json
```

Index build:

```bash
npm run artisjus:build-index
npm run cmo:build-index
```
