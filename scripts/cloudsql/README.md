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
npm run cloudsql:load-indexes   # ~2–3M sor, pár perc
npm run cloudsql:parity         # fájl vs DB egyezés
```

Újrafuttatható: truncate + COPY.

## Schema

```bash
psql "$MEDER_POSTGRES_ADMIN_URL" -f scripts/cloudsql/schema.sql
```
