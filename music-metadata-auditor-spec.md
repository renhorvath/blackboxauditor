# Music Metadata Auditor — Cursor Specification

## Projekt összefoglalója

Egy webalapú eszköz európai előadók, szerzők, kiadók és publisherek számára, amely
ISRC-kódok listáját fogadja be, és a credits.fm API-n valamint az MLC nyilvános adatain
keresztül audit-riportot állít elő: hol hiányzik az ISWC, hol "unmatched" az MLC-nél
a felvétel, hol nem teljes a szerzői share-allokáció, hol nincs IPI azonosítva.

**Cél:** azonosítani azokat az adathibákat, amelyek miatt a jogosult valószínűleg nem kap
jogdíjat, amelyet kaphatna.

---

## Tech stack

- **Framework:** Next.js 14+ (App Router)
- **Nyelv:** TypeScript
- **Styling:** Tailwind CSS + CSS variables az egyedi design tokenekhez
- **Adatlekérés:** native fetch, server actions a secrets védelméhez
- **CSV parse:** papaparse
- **Tábla/export:** @tanstack/react-table + custom CSV export
- **Ikonok:** lucide-react
- **Deployment:** Vercel (vagy bármely Next.js-kompatibilis host)

---

## Könyvtárstruktúra

```
/
├── app/
│   ├── layout.tsx
│   ├── page.tsx                  # Landing + input form
│   ├── audit/
│   │   └── page.tsx              # Audit results dashboard
│   └── api/
│       ├── batch/route.ts        # credits.fm /v1/batch proxy
│       ├── audit-shares/route.ts # credits.fm /v1/audit/shares proxy
│       └── audit-unmatched/route.ts # credits.fm /v1/audit/unmatched proxy
├── components/
│   ├── IsrcInput.tsx             # CSV feltöltés + kézi beírás
│   ├── AuditTable.tsx            # Fő eredménytábla
│   ├── AuditSummary.tsx          # Összesítő kártyák
│   ├── IssueTag.tsx              # Státusz badge-ek
│   └── ExportButton.tsx          # CSV export
├── lib/
│   ├── credits-fm.ts             # API client
│   ├── audit-engine.ts           # Aggregáló logika
│   ├── isrc-validator.ts         # ISRC formátum validáció
│   └── types.ts                  # Shared TypeScript típusok
└── .env.local
    CREDITS_FM_API_KEY=           # Opcionális, magasabb rate limit-hez
```

---

## API integráció — credits.fm

**Base URL:** `https://api.credits.fm/v1`

Az összes credits.fm hívás **szerver oldalon** történik (`/app/api/...` route handlers-en
keresztül), hogy az API key ne kerüljön a kliens oldalra.

### Használt végpontok

#### 1. Batch lookup — `/v1/batch` (POST)

Az ISRC-lista feldolgozásának fő belépési pontja.

```typescript
// Request
{
  "ids": ["USRC17607839", "GBAYE0601498", ...], // max 100 per request
  "types": ["isrc"]
}

// Response shape (amit használunk)
{
  "results": [
    {
      "id": "USRC17607839",
      "type": "isrc",
      "found": true,
      "data": {
        "isrc": "USRC17607839",
        "title": "...",
        "artists": [...],
        "iswc": "T-123456789-0",      // null ha nincs
        "songwriters": [...],
        "publishers": [...],
        "mlc_song_code": "...",        // null ha nincs MLC-regisztráció
        "mlc_portal_url": "..."
      }
    }
  ]
}
```

**Amit figyelni kell a response-ban:**
- `data.iswc === null` → ISWC hiányzik
- `data.mlc_song_code === null` → nincs MLC-regisztráció
- `data.songwriters` tömb üres → nincs songwriter adat
- `data.found === false` → az ISRC egyáltalán nem ismert

#### 2. Share audit — `/v1/audit/shares` (POST)

```typescript
// Request
{ "isrcs": ["USRC17607839", ...] } // max 100

// Response
{
  "results": [
    {
      "isrc": "USRC17607839",
      "total_share": 87.5,           // százalék, 100 = teljes
      "share_status": "incomplete",  // "complete" | "incomplete" | "missing" | "over_allocated"
      "songwriter_count": 2,
      "missing_share": 12.5
    }
  ]
}
```

#### 3. Unmatched audit — `/v1/audit/unmatched` (POST)

```typescript
// Request
{ "isrcs": ["USRC17607839", ...] } // max 100

// Response
{
  "results": [
    {
      "isrc": "USRC17607839",
      "matched": true,     // false = unmatched az MLC-nél
      "match_status": "matched" | "unmatched" | "not_in_mlc"
    }
  ]
}
```

### Rate limiting és batching logika

A credits.fm ingyenes szintje rate-limitált. A `/lib/credits-fm.ts` client kezelje:

```typescript
// lib/credits-fm.ts

const BATCH_SIZE = 100
const DELAY_BETWEEN_BATCHES_MS = 500

export async function batchFetch(isrcs: string[]): Promise<BatchResult[]> {
  const chunks = chunkArray(isrcs, BATCH_SIZE)
  const results: BatchResult[] = []
  
  for (const chunk of chunks) {
    const res = await fetch('https://api.credits.fm/v1/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.CREDITS_FM_API_KEY 
          ? { 'Authorization': `Bearer ${process.env.CREDITS_FM_API_KEY}` }
          : {})
      },
      body: JSON.stringify({ ids: chunk, types: ['isrc'] })
    })
    const data = await res.json()
    results.push(...data.results)
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await delay(DELAY_BETWEEN_BATCHES_MS)
    }
  }
  return results
}
```

---

## Adatmodell

### `AuditRow` — egy sor a táblában

```typescript
// lib/types.ts

export type IssueType =
  | 'no_iswc'           // ISWC teljesen hiányzik
  | 'no_mlc_match'      // MLC-nél unmatched
  | 'not_in_mlc'        // MLC-nél egyáltalán nem szerepel
  | 'incomplete_shares' // Share-összeg < 100%
  | 'over_allocated'    // Share-összeg > 100%
  | 'no_songwriter'     // Nincs songwriter adat
  | 'not_found'         // Az ISRC nem ismert egyetlen adatbázisban sem

export type IssueSeverity = 'critical' | 'warning' | 'info'

export interface AuditIssue {
  type: IssueType
  severity: IssueSeverity
  message: string           // Magyar szöveg, emberi olvasásra
  action: string            // Konkrét javasolt lépés
}

export interface AuditRow {
  isrc: string
  title: string | null
  artist: string | null
  iswc: string | null
  mlcMatchStatus: 'matched' | 'unmatched' | 'not_in_mlc' | 'unknown'
  shareTotal: number | null       // 0-100 között, null ha nincs adat
  shareStatus: 'complete' | 'incomplete' | 'over_allocated' | 'missing'
  songwriterCount: number
  publisherCount: number
  issues: AuditIssue[]
  rawBatchData: unknown           // Az eredeti API response debugginghoz
}

export interface AuditSummary {
  total: number
  withCriticalIssues: number
  withIswcMissing: number
  withMlcUnmatched: number
  withIncompleteShares: number
  withNoSongwriter: number
  notFound: number
}
```

---

## Audit logika — `lib/audit-engine.ts`

Az audit engine a három API hívás eredményeit kombinálja egyetlen `AuditRow[]` tömbbé,
és az issue-kat generálja.

```typescript
export function buildAuditRows(
  batchResults: BatchResult[],
  shareResults: ShareAuditResult[],
  unmatchedResults: UnmatchedAuditResult[]
): AuditRow[] {
  return batchResults.map(batch => {
    const share = shareResults.find(s => s.isrc === batch.id)
    const unmatched = unmatchedResults.find(u => u.isrc === batch.id)
    const issues: AuditIssue[] = []

    // 1. Nem találták meg az ISRC-t egyáltalán
    if (!batch.found) {
      issues.push({
        type: 'not_found',
        severity: 'critical',
        message: 'Ez az ISRC-kód nem szerepel egyetlen ismert adatbázisban sem.',
        action: 'Ellenőrizd az ISRC formátumát. Ha helyes, regisztráld a IFPI-nál vagy a distributoroddal.'
      })
    }

    // 2. ISWC hiányzik
    if (batch.found && !batch.data?.iswc) {
      issues.push({
        type: 'no_iswc',
        severity: 'critical',
        message: 'Nincs ISWC (International Standard Musical Work Code) hozzárendelve ehhez a felvételhez.',
        action: 'Regisztráld a művet a CISAC-nál a tagszervezeted (pl. ARTISJUS) közreműködésével, hogy ISWC-t kapjon.'
      })
    }

    // 3. MLC státusz
    if (unmatched?.match_status === 'unmatched') {
      issues.push({
        type: 'no_mlc_match',
        severity: 'critical',
        message: 'Az MLC (Mechanical Licensing Collective) összegyűjtött mechanikai jogdíjat ehhez a felvételhez, de nem találja a jogosultat.',
        action: 'Regisztrálj az MLC-nél (themlc.com), vagy kérd meg az ARTISJUS-t, hogy reciprocity agreement keretében igényelje a jogdíjat.'
      })
    }

    if (unmatched?.match_status === 'not_in_mlc') {
      issues.push({
        type: 'not_in_mlc',
        severity: 'warning',
        message: 'Ez a felvétel nem szerepel az MLC adatbázisában. Az USA-ból érkező mechanikai jogdíj elveszhet.',
        action: 'Ellenőrizd, hogy a publisher regisztrálva van-e az MLC-nél, és a felvétel össze van-e kapcsolva a művel.'
      })
    }

    // 4. Hiányos share-allokáció
    if (share?.share_status === 'incomplete') {
      issues.push({
        type: 'incomplete_shares',
        severity: 'warning',
        message: `A szerzői tulajdonrészek összege csak ${share.total_share}% (hiányzik: ${share.missing_share}%).`,
        action: 'Ellenőrizd az összes szerzőnél, hogy a publishing oldal regisztrálva van-e, és a share-ek helyesen vannak-e megadva.'
      })
    }

    if (share?.share_status === 'over_allocated') {
      issues.push({
        type: 'over_allocated',
        severity: 'critical',
        message: `A szerzői tulajdonrészek összege ${share.total_share}% — több mint 100%.`,
        action: 'Duplikált regisztráció vagy téves share-megadás valószínű. Fordulj a publisherhez és az ARTISJUS-hoz.'
      })
    }

    // 5. Nincs songwriter adat
    if (batch.found && (!batch.data?.songwriters || batch.data.songwriters.length === 0)) {
      issues.push({
        type: 'no_songwriter',
        severity: 'warning',
        message: 'Nincs szerzői (songwriter) adat ehhez a felvételhez az MLC adatbázisában.',
        action: 'A publisher regisztrálja a szerzőket az MLC-nél, vagy az ARTISJUS-on keresztül igényelje az adatok frissítését.'
      })
    }

    return {
      isrc: batch.id,
      title: batch.data?.title ?? null,
      artist: batch.data?.artists?.[0]?.name ?? null,
      iswc: batch.data?.iswc ?? null,
      mlcMatchStatus: unmatched?.match_status ?? 'unknown',
      shareTotal: share?.total_share ?? null,
      shareStatus: share?.share_status ?? 'missing',
      songwriterCount: batch.data?.songwriters?.length ?? 0,
      publisherCount: batch.data?.publishers?.length ?? 0,
      issues,
      rawBatchData: batch
    }
  })
}
```

---

## UI komponensek

### `app/page.tsx` — Input oldal

Három beviteli mód:
1. **CSV feltöltés** — drag & drop, papaparse-szal feldolgozva
2. **Szöveges beillesztés** — soronként egy ISRC, textarea
3. **Spotify URL** — a credits.fm URL resolution végpontján keresztül

Az ISRC validátor (`lib/isrc-validator.ts`) ellenőrzi a formátumot (2 betű + 3 alfanum + 2 szám + 5 szám = 12 karakter) és kiszűri az érvényteleneket.

Állapotok a feltöltési folyamatban:
- `idle` — kezdő állapot
- `validating` — ISRC-k validálása
- `fetching` — API hívások folyamatban (progress bar: X/Y kész)
- `done` — redirect az `/audit` oldalra a sessionStorage-ban tárolt eredményekkel

```typescript
// Minimális state machine az input oldalon
type UploadState = 
  | { status: 'idle' }
  | { status: 'validating'; count: number }
  | { status: 'fetching'; done: number; total: number }
  | { status: 'error'; message: string }
  | { status: 'done'; rowCount: number }
```

### `app/audit/page.tsx` — Eredmény dashboard

Két fő szekcióból áll: összesítő kártyák felül, részletes tábla alul.

**Összesítő kártyák (`AuditSummary.tsx`):**
```
[ Összes felvétel: 47 ]  [ Kritikus problémák: 12 ]  [ Hiányzó ISWC: 8 ]
[ MLC unmatched: 5 ]     [ Hiányos share: 9 ]         [ Nem található: 3 ]
```

**Részletes tábla (`AuditTable.tsx`):**

Oszlopok:
```
ISRC | Cím | Előadó | ISWC | MLC státusz | Share % | Problémák | Műveletek
```

A "Problémák" oszlopban `IssueTag` badge-ek jelennek meg (piros = critical, sárga = warning).

A tábla szűrhető és rendezhető:
- szűrés: csak critical, csak warning, csak egy adott issue típus
- rendezés: problémák száma szerint (legsúlyosabb elöl alapértelmezett)

**Sor expand panel** — egy sorra kattintva lenyílik a részletes nézet:
- Az összes issue leírással és javasolt lépéssel
- Raw data accordion (fejlesztői debug)
- Linkek: credits.fm profil, MLC portal (ha van `mlc_portal_url`)

### `ExportButton.tsx` — CSV export

Az aktuálisan szűrt sorok exportálása CSV-be. Az export tartalmaz minden oszlopot
plusz az issues szövegesen felsorolva.

```
ISRC,Cím,Előadó,ISWC,MLC státusz,Share %,Problémák,Javasolt lépések
```

---

## Design irány

**Koncepció:** ipari precizitás — olyan eszköz esztétikája, amit mérnökök és könyvelők
egyaránt kézbe vesznek. Nem marketing tool, hanem munkainstrumentum.

**Paletta:**
```css
:root {
  --bg-primary: #0f1117;          /* mélyfekete háttér */
  --bg-secondary: #1a1d27;        /* kártya háttér */
  --bg-elevated: #22263a;         /* hover, expanded state */
  --accent-primary: #4ade80;      /* zöld — ok státusz */
  --accent-warning: #fbbf24;      /* sárga — warning */
  --accent-critical: #f87171;     /* piros — critical */
  --accent-muted: #6366f1;        /* indigo — info, linkek */
  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-muted: #475569;
  --border: #2d3348;
  --border-active: #4ade80;
}
```

**Tipográfia:**
- Display/heading: `IBM Plex Mono` — monospace, ipari karakter
- Body: `Inter` — csak itt engedélyezett, mert valóban olvasható táblákhoz kell

**Animációk:** minimális — csak a tábla sorok staggered fade-in betöltésnél,
és a progress bar a fetch folyamat alatt. Nincs gimmick.

**Layout:** single-column, max-width 1200px, generous padding. A tábla horizontálisan
scrollozható mobile-on.

---

## API route-ok (Next.js server side)

### `app/api/batch/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { isrcs } = await req.json()
  
  if (!Array.isArray(isrcs) || isrcs.length > 100) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const res = await fetch('https://api.credits.fm/v1/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.CREDITS_FM_API_KEY
        ? { 'Authorization': `Bearer ${process.env.CREDITS_FM_API_KEY}` }
        : {})
    },
    body: JSON.stringify({ ids: isrcs, types: ['isrc'] })
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'Upstream error', status: res.status }, { status: 502 })
  }

  const data = await res.json()
  return NextResponse.json(data)
}
```

Ugyanez a pattern az `audit-shares` és `audit-unmatched` route-oknál.

---

## ISRC validátor — `lib/isrc-validator.ts`

```typescript
// ISRC formátum: CC-XXX-YY-NNNNN
// CC = 2 betű (ország), XXX = 3 alfanum (regisztráló), YY = 2 szám (év), NNNNN = 5 szám
const ISRC_REGEX = /^[A-Z]{2}[A-Z0-9]{3}[0-9]{2}[0-9]{5}$/

export function validateIsrc(raw: string): { valid: boolean; normalized: string } {
  const normalized = raw.trim().toUpperCase().replace(/-/g, '')
  return {
    valid: ISRC_REGEX.test(normalized),
    normalized
  }
}

export function parseIsrcInput(raw: string): {
  valid: string[]
  invalid: string[]
} {
  const lines = raw.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean)
  const valid: string[] = []
  const invalid: string[] = []
  
  for (const line of lines) {
    const { valid: isValid, normalized } = validateIsrc(line)
    if (isValid) valid.push(normalized)
    else invalid.push(line)
  }
  
  return { valid: [...new Set(valid)], invalid } // deduplicate
}
```

---

## CSV input feldolgozás

A CSV-ben az ISRC bárhol lehet — a parser megkeresi az első oszlopot, amelynek fejléce
tartalmazza az "isrc" szót (case-insensitive), vagy ha nincs fejléc, az első oszlopot veszi.

```typescript
import Papa from 'papaparse'

export function parseCsvForIsrcs(csvText: string): string[] {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true })
  
  // Fejléces CSV esetén keressük az ISRC oszlopot
  if (parsed.meta.fields && parsed.meta.fields.length > 0) {
    const isrcField = parsed.meta.fields.find(f => 
      f.toLowerCase().includes('isrc')
    )
    if (isrcField) {
      return (parsed.data as Record<string, string>[])
        .map(row => row[isrcField])
        .filter(Boolean)
    }
  }
  
  // Fejléc nélküli esetén az első oszlop
  return (parsed.data as string[][]).map(row => row[0]).filter(Boolean)
}
```

---

## Hibaállapotok kezelése

| Eset | UI reakció |
|------|-----------|
| credits.fm rate limit (429) | Automatikus retry 2s delay után, max 3 kísérlet |
| Részleges batch hiba | A sikeres sorok megjelennek, a hibasoros "lekérdezési hiba" státusszal |
| Üres eredmény (0 sor) | "Egyetlen ISRC sem volt felismerhető" üzenet, visszalink az input oldalra |
| Teljesen offline | "A credits.fm API jelenleg nem elérhető" üzenet |
| Érvénytelen ISRC-k | Megjelenik a warning: "X érvénytelen ISRC-t kizártuk" + listázza őket |

---

## Oldalak és navigáció

```
/ (Landing + input)
  └── /audit (Eredmény tábla)
        └── ?filter=critical  (szűrt nézet, URL-ben tárolva)
```

Az eredmény adatot `sessionStorage`-ban tárolni (JSON), hogy az `/audit` oldal
közvetlen URL-ről is működjön (frissítés esetén visszadobja az input oldalra, ha
nincs sessionStorage adat).

---

## Fejlesztési sorrend (prioritás szerint)

1. **API route-ok** (`/api/batch`, `/api/audit-shares`, `/api/audit-unmatched`) — ezek nélkül semmi sem működik
2. **`lib/credits-fm.ts`** és **`lib/audit-engine.ts`** — az üzleti logika
3. **`lib/isrc-validator.ts`** és **`lib/csv-parser.ts`** — input feldolgozás
4. **Input oldal** (`app/page.tsx`) — a három beviteli mód
5. **Audit tábla** (`app/audit/page.tsx` + `AuditTable.tsx`) — az eredmény megjelenítése
6. **Összesítő kártyák** (`AuditSummary.tsx`) — gyors áttekintés
7. **CSV export** (`ExportButton.tsx`)
8. **Design finomítás** — paletta, tipográfia, animációk

---

## Egyéb megjegyzések a megvalósításhoz

- Az összes credits.fm hívás a szerver oldalon fut — sosem a kliensen. Ez védi az API key-t és megkerüli a CORS-t.
- A fetch folyamat progress-e Server-Sent Events-szel vagy egyszerűen a frontend-oldali batch-looppal kezelhető (utóbbi egyszerűbb).
- Az `rawBatchData` mező az `AuditRow`-ban debug célokra van — production buildben el lehet rejteni, de ne töröljük, hasznos lesz a edge case-ek diagnosztizálásakor.
- A credits.fm API-nak van MCP szervere is (`https://credits.fm/mcp`) — ha a projekt Claude Code-dal fejlődik tovább, ez közvetlenül beköthetó.
- Az éles deploymentnél érdemes a results-ot szerver-oldalon cachelni (pl. Redis vagy Vercel KV) az ISRC-k hash-e alapján, hogy ugyanazokra a kódokra ne kelljen újra lekérdezni 24 órán belül.
