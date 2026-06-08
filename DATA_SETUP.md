# Adatok és gépek közötti munkafolyamat

A **kód** megy GitHubra; a **nagy fájlok** (MLC TSV, ARTISJUS CSV-k, DuckDB, Parquet) **soha nem**.

## Mi hol van

| Tartalom | Hol | Git |
|----------|-----|-----|
| Next.js app, scriptek | `blackbox_auditor` repo | ✅ commit |
| API kulcsok | `.env.local` | ❌ gitignore |
| MLC `unmatchedresources.tsv` (~121 GB) | Külső adatmappa a **adatgépen** | ❌ |
| ARTISJUS / CMO CSV-k | Ugyanott vagy `Artisjus azonosítatlan művek/` (lokális) | ❌ |
| `artisjus-index.json` | `data/` (generált) | ❌ |
| `catalog.duckdb`, Parquet | `derived/` (később) | ❌ |

## Ajánlott mappa-struktúra (adatgépen, repo **mellett**)

```
/Volumes/Data/music-rights/          # vagy bármilyen fix path
  raw/
    mlc/unmatchedresources.tsv
    artisjus/artisjus_azonositatlan_muvek_2025.csv
  derived/
    mlc-hu/                          # MLC_HU_DATA_DIR
      hungarian_unmatched_export.csv
      mb_hu_artists.json
      parquet/
      catalog.duckdb                 # később: gyors keresés
```

A repó lehet pl. `~/Projects/blackbox_auditor` — az adat **nem** kell benne legyen.

## Első beállítás — adatgép (ahol a nagy fájlok vannak)

```bash
git clone https://github.com/renhorvath/blackboxauditor.git
cd blackbox_auditor
npm install
cp .env.example .env.local
```

Szerkeszd a `.env.local`-t (példa pathokkal):

```env
MLC_UNMATCHED_TSV=/Volumes/Data/music-rights/raw/mlc/unmatchedresources.tsv
MLC_HU_DATA_DIR=/Volumes/Data/music-rights/derived/mlc-hu
ARTISJUS_CSV_PATH=/Volumes/Data/music-rights/raw/artisjus/artisjus_azonositatlan_muvek_2025.csv
ARTISJUS_INDEX_PATH=/Users/<te>/Projects/blackbox_auditor/data/artisjus-index.json

SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
CREDITS_FM_API_KEY=...
```

ARTISJUS index építése (egyszer, vagy új CSV-nél):

```bash
npm run artisjus:build-index
```

MLC pipeline: lásd `scripts/mlc/README.md`.

Dev szerver:

```bash
npm run dev
# http://localhost:3002
```

## Fejlesztő gép (ahol nincs adat)

Ugyanaz a `git clone` + `.env.local`. Ha nincs lokális TSV, az MLC/ARTISJUS funkciók nem lesznek elérhetők — UI és credits.fm audit így is fut.

Később (online query): a Vercel env-ben lesz `QUERY_API_URL` egy állandó backend felé (adatgép vagy VPS).

## Szinkron gépek között

| Mit | Hogyan |
|-----|--------|
| Kód | `git push` / `git pull` |
| Nagy fájlok | **Ne git.** Már az adatgépen vannak, vagy SSD / `rsync` |
| Generált index | `npm run artisjus:build-index` az adatgépen |

## Commit előtti ellenőrzés

```bash
git status
```

Ne legyen staged:

- `Artisjus azonosítatlan művek/`
- `.env.local`
- `*.tsv`, `*.duckdb`, `*.parquet`, `*.xlsx`

Ha véletlenül hozzáadtad: `git reset HEAD <fájl>` mielőtt commitolsz.

## További kontextus

- Projekt összefoglaló: `music-metadata-audit-projekt-riport.md`
- MLC scriptek: `scripts/mlc/README.md`
- Env változók listája: `.env.example`
