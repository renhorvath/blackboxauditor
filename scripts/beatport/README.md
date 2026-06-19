# Beatport cross-check (SNYL catalog)

Beatport API v4 OAuth + katalógus összehasonlítás a Spotify scrape-hez képest.

## Fontos: client_id

A **Beatportal regisztráció nem ad működő OAuth client_id-t** ehhez a catalog API-hoz.
A helyes ID a [Beatport API docs](https://api.beatport.com/v4/docs/) Swagger UI-jából jön — automatikusan scrape-eljük.

```bash
python3 scripts/beatport/fetch_client_id.py
```

Ha `Invalid client_id parameter value` hibát kapsz, valószínűleg rossz ID-t másoltál be (pl. regisztrációs azonosító, email, stb.).

## Setup

`.env.local`:

```bash
BEATPORT_USERNAME=your_beatport_login_email
BEATPORT_PASSWORD=your_beatport_password
# BEATPORT_CLIENT_ID=   ← hagyd üresen (auto-fetch a docs-ból)
```

**Nincs szükség** `BEATPORT_CLIENT_SECRET`-re a standard flow-hoz.

## Futtatás

```bash
# 1. Public client_id ellenőrzés
python3 scripts/beatport/fetch_client_id.py

# 2. Auth teszt (login → token)
python3 scripts/beatport/auth_test.py

# 3. Cross-check (hiányzó trackek)
python3 scripts/beatport/crosscheck_snyl.py
```

## Auth flow (mi történik)

1. Scrape `API_CLIENT_ID` a docs JS-ből
2. `POST /auth/login/` — Beatport username + password (session cookie)
3. `GET /auth/o/authorize/` — authorization code
4. `POST /auth/o/token/` — access_token + refresh_token

Token cache: `data/beatport_token.json`

## Alternatíva: token a böngészőből

Ha a password flow nem megy:

1. Nyisd meg https://api.beatport.com/v4/docs/
2. DevTools → Network
3. Kattints **Login**, jelentkezz be
4. Keresd meg a `auth/o/token/` response-t
5. Másold a teljes JSON-t → `data/beatport_token.json`:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": 9999999999,
  "token_type": "Bearer"
}
```

(`expires_at` = unix timestamp, pl. most + 36000)

## Kimenet

| Fájl | Tartalom |
|------|----------|
| `data/snyl_beatport_tracks.csv` | Összes SNYL-releváns Beatport track |
| `data/snyl_beatport_missing.csv` | Beatport-on van, Spotify scrape-ben nincs |
| `data/snyl_beatport_crosscheck.json` | Számok összefoglaló |
