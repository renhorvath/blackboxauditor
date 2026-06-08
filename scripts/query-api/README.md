# Query API — online adatgép backend

A Vercel UI **nem** fér hozzá a 20 GB DuckDB-hez és a JSON indexekhez. Ez a szolgáltatás az adatgépen fut 24/7, a Vercel pedig `QUERY_API_URL`-en keresztül hívja.

```
Vercel (Next.js)  ──POST /v1/artist/sources──►  Query API (adatgép)
                                                      ├── catalog.duckdb (MLC)
                                                      ├── artisjus-index.json
                                                      └── cmo-index.json
```

EJI továbbra is a Vercel oldalon fut (web scrape).

## Indítás (adatgép)

```bash
# Előfeltétel: indexek + catalog (lásd HANDOFF.md)
npm run query-api:start
```

Alapértelmezett: `http://127.0.0.1:8787`

Env (`.env.local`):

```bash
QUERY_API_PORT=8787
QUERY_API_HOST=127.0.0.1
QUERY_API_KEY=your-long-random-secret
```

## Health check

```bash
curl -s -H "Authorization: Bearer $QUERY_API_KEY" http://127.0.0.1:8787/health | jq
```

Válasz:

```json
{
  "ok": true,
  "version": 1,
  "capabilities": {
    "catalog": true,
    "artisjusIndex": true,
    "cmoIndex": true
  }
}
```

## Artist sources endpoint

```bash
curl -s -X POST http://127.0.0.1:8787/v1/artist/sources \
  -H "Authorization: Bearer $QUERY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"artistName":"Jazzbois"}' | jq '.mlcUnmatched.uniqueIsrcCount, .artisjusMatches | length'
```

## Cloudflare Tunnel (ajánlott)

1. Telepítsd: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:8787
```

3. A kapott `https://….trycloudflare.com` URL → Vercel env:

```
QUERY_API_URL=https://your-tunnel.trycloudflare.com
QUERY_API_KEY=your-long-random-secret   # ugyanaz mint az adatgépen
```

**Éles tunnel:** Cloudflare Zero Trust → named tunnel + fix hostname (pl. `query.yourdomain.com`).

## Vercel env

| Változó | Hol | Leírás |
|---------|-----|--------|
| `QUERY_API_URL` | Vercel | Tunnel/public URL, trailing slash nélkül |
| `QUERY_API_KEY` | Vercel + adatgép | Bearer token (kötelező élesben) |
| `QUERY_API_TIMEOUT_MS` | Vercel | Default 120000 (MLC DuckDB query) |

## Lokális Next.js teszt remote API-val

```bash
QUERY_API_URL=http://127.0.0.1:8787 QUERY_API_FORCE=true npm run dev
```

## systemd (opcionális, éles adatgép)

```ini
[Unit]
Description=Blackbox Auditor Query API
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/blackbox_auditor
EnvironmentFile=/path/to/blackbox_auditor/.env.local
ExecStart=/usr/bin/npx tsx scripts/query-api/server.mts
Restart=on-failure

[Install]
WantedBy=multi-user.target
```
