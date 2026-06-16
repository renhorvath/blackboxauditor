# Adatgép checklist

Lokális artist audit + publish előkészítés. Nagy fájlok **nem** mennek Vercelre.

## Egyszeri beállítás

```bash
git clone https://github.com/renhorvath/blackboxauditor.git
cd blackboxauditor
npm install
cp .env.example .env.local
# Töltsd ki a pathokat — lásd DATA_SETUP.md
```

## Indexek

```bash
npm run artisjus:build-index
npm run cmo:build-index
# GVL Sendemeldungen (egyszer, ha van PDF):
npm run cmo:gvl-extract-sendemeldungen
```

GVL raw: symlink `raw/cmo/de-gvl` → `~/Downloads/gvl` (listen, produktionen_*, sendemeldungen).

## MLC DuckDB (ajánlott)

```bash
npm run etl:parquet      # ha van TSV
npm run etl:catalog
npm run etl:artist-tokens:unmatched
npm run etl:isrc-index:unmatched
```

Első unmatched artist scan **több perc** lehet. `.env.local`:

```env
MLC_USE_DUCKDB=true
# Első scan ne vágódjon le 85s-nél (Query API / lokális audit):
MLC_SCAN_RACE_MS=600000
```

## Publish jelentés Vercelre

Adatgépen (lokális audit után):

```env
REPORT_PUBLISH_URL=https://your-app.vercel.app/api/reports/publish
PUBLISH_API_KEY=<ugyanaz mint Vercelen>
```

UI: „Jelentés közzététele” gomb, vagy:

```bash
node scripts/batch_artist_audit.mjs --publish "Előadó neve"
```

## Vercel env (éles)

| Változó | Hol |
|---------|-----|
| `DATABASE_URL` | Neon Postgres (Vercel Marketplace) |
| `PUBLISH_API_KEY` | Publish API auth |
| `OPERATOR_SECRET` | `/r/{token}/manage`, `/admin/reports` |
| `ARTIST_AUDIT_SKIP_MLC_UNMATCHED` | `true` — scan lokálisan, Vercel csak report |

Migrate: `npm run db:migrate` (Vercel build vagy lokálisan `DATABASE_URL`-lel).
