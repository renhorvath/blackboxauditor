# iMac / macOS adatszerver — 24/7 query API + Cloudflare tunnel

Az iMac tartja a DuckDB-t és indexeket; a Vercel UI a tunneleken keresztül hívja.

```
Vercel  ──HTTPS──►  cloudflared  ──►  query API :8787  ──►  catalog.duckdb + JSON indexek
```

## Előfeltétel

1. Repo klón, `.env.local` kitöltve (`QUERY_API_KEY`, adatpathok — lásd `DATA_SETUP.md`)
2. Indexek + catalog kész (`npm run artisjus:build-index`, `npm run cmo:build-index`, `npm run etl:catalog`)
3. `brew install cloudflared`
4. **Energiatakarékosság:** System Settings → Energy → prevent sleep while plugged in (vagy `caffeinate` / Amphetamine)

## Telepítés (egyszer)

```bash
chmod +x scripts/server/*.sh
npm run server:install
```

Ez két **LaunchAgent**-et telepít (`~/Library/LaunchAgents/`):

| Szolgáltatás | Label | Mit csinál |
|--------------|-------|------------|
| Query API | `com.blackboxauditor.query-api` | `tsx scripts/query-api/server.mts`, `.env.local` betöltéssel |
| Tunnel | `com.blackboxauditor.cloudflared` | `cloudflared tunnel run` vagy quick tunnel |

**Login után automatikusan indul**, crash után újraindul (`KeepAlive`).

Logok: `~/Library/Logs/blackboxauditor/`

## Ellenőrzés

```bash
npm run server:status
npm run server:tunnel-url   # quick tunnel URL (ha nincs named tunnel)
```

Health lokálisan:

```bash
source .env.local
curl -s -H "Authorization: Bearer $QUERY_API_KEY" http://127.0.0.1:8787/health | jq
```

## Vercel env

| Változó | Érték |
|---------|--------|
| `QUERY_API_URL` | Named tunnel: `https://query.yourdomain.com` — quick tunnel: `npm run server:tunnel-url` |
| `QUERY_API_KEY` | Ugyanaz mint `.env.local` |
| `ARTIST_AUDIT_SKIP_MLC=true` | Unmatched kihagyása amíg token index épül |

**Quick tunnel:** minden cloudflared restart → **új URL** → Vercel env frissítés + redeploy.

## Fix URL (named tunnel) — ajánlott élesre

1. Cloudflare fiók + domain a CF-nél
2. `cloudflared tunnel login`
3. `cloudflared tunnel create blackbox-query`
4. `cloudflared tunnel route dns blackbox-query query.yourdomain.com`
5. Másold `scripts/server/cloudflared-config.yml.example` → `~/.cloudflared/config.yml`, töltsd ki
6. `npm run server:install` (újratölti a cloudflared agentet — most `tunnel run`-t használ)

## Eltávolítás

```bash
npm run server:uninstall
```

## Token index build és lock

Amíg fut az `npm run etl:artist-tokens`, a DuckDB zárolt — az MLC lekérdezés kimarad, ARTISJUS/CMO/EJI megy tovább.

## Restart / update után

`npm run cmo:build-index` vagy `artisjus:build-index` után a query API újratölti az indexet (mtime alapján). Ha mégis régi találatok jönnek:

```bash
lsof -i :8787 -sTCP:LISTEN   # ha nem a LaunchAgent PID-je, öld meg
launchctl kickstart -k gui/$(id -u)/com.blackboxauditor.query-api
```

LaunchAgentek maguktól indulnak. Ha kézzel állítottad le:

```bash
launchctl load ~/Library/LaunchAgents/com.blackboxauditor.query-api.plist
launchctl load ~/Library/LaunchAgents/com.blackboxauditor.cloudflared.plist
```

## Mi nem old meg automatikusan

- **Áramszünet** — UPS ajánlott; utána login + agentek (ha auto-login be van kapcsolva, magától megy)
- **macOS update reboot** — LaunchAgents login után indulnak
- **Repo `git pull`** — query API restart: `launchctl kickstart -k gui/$(id -u)/com.blackboxauditor.query-api`
