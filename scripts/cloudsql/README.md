# Cloud SQL — Meder indexek (ARTISJUS + EU CMO + GVL)

A publikus landing kereső az `mlc-database-small` Cloud SQL instance `meder` schemájából olvas.
MLC továbbra is lokális Query API / DuckDB (nem része ennek).

## Instance

- Project: `synch-reload`
- Instance: `mlc-database-small` (Postgres 15)
- Schema: `meder`
- Users: `meder_ro` (Vercel/app), `meder_loader` (betöltés)

## Env (`.env.local` + Vercel)

```bash
INDEX_DATABASE_URL=postgresql://meder_ro:…@34.68.193.224:5432/mlc_production?sslmode=require
INDEX_LOADER_DATABASE_URL=postgresql://meder_loader:…@34.68.193.224:5432/mlc_production?sslmode=require
```

Ha `INDEX_DATABASE_URL` be van állítva, az ARTISJUS/CMO keresés Cloud SQL-t használ (Query API / lokális JSON helyett).

Vercelre (login után):

```bash
npx vercel login
bash scripts/cloudsql/push-vercel-env.sh
npx vercel --prod
```

Az instance authorized networkje jelenleg `0.0.0.0/0` (Vercel dinamikus IP miatt), `meder_ro` csak SELECT a `meder` schemán.

## Betöltés (adatgépen)

```bash
npm run cloudsql:load-indexes   # ARTISJUS + EU CMO JSON (+ GVL külön fájl)
npm run cloudsql:load-ucmr      # UCMR-ADA CSV → meder.cmo_records (ro-ucmr-ada only; no mega JSON)
npm run cloudsql:parity         # fájl vs DB egyezés
```

UCMR: `raw/cmo/ro-ucmr-ada/unidentified.csv` (vagy `UCMR_CSV_PATH`). Mezők max 500 karakterre vágva (PDF parse poison). Nem truncate-eli a többi source-ot. Címtisztítás (Public/Cablu/Q4/évszám kiszórása): `python3 scripts/cmo/ucmr_clean.py`, majd `UCMR_CSV_PATH=raw/cmo/ro-ucmr-ada/unidentified.clean.csv npm run cloudsql:load-ucmr`.

Újrafuttatható: truncate + COPY (teljes index); UCMR load csak `DELETE … WHERE source = 'ro-ucmr-ada'`.

**A teljes `cloudsql:load-indexes` kiüríti az egész `cmo_records`-ot** — ami helyben nincs meg a `raw/cmo/` alatt, az élesből eltűnik. Egy-egy forrás frissítésére a részleges mód kell:

```bash
python3 scripts/cmo/build_indexes.py --only sk-soza,ro-credidam   # → data/cmo-index.partial.json
npm run cloudsql:load-indexes -- --partial                         # forrásonként 1 tranzakció
npm run cloudsql:load-indexes -- --drop ee-eau                     # forrás törlése
```

Új forrás-id (`index_meta`-ban még nincs) csak `--allow-new-source`-szal megy be, és **csak azután, hogy az azt ismerő kód élesben van**: a landing kereső minden `index_meta` forrást címkéhez köt. Adatváltozás után emeld a `CACHE_VERSION`-t a `lib/landing-search-db.ts`-ben (7 napos találat-cache).

## Schema

```bash
psql "$MEDER_POSTGRES_ADMIN_URL" -f scripts/cloudsql/schema.sql
```
