# Pitch packet — HU solo jogosultak (top 10 pilot)

**Forrás:** ARTISJUS 2025 azonosítatlan lista, zeneműkiadó nélküli sorok, személy jogosult.  
**Generálva:** 2026-06-17  
**Audit eredmény:** `exports/batch_audit_results.json` (ARTISJUS + EU CMO index; MLC az adatgépen)

---

## Általános sablon

**Tárgy:** ARTISJUS azonosítatlan listája – [Név] – ingyenes portfólió-összefoglaló?

> Szia [Név],
>
> Az ARTISJUS nyilvános azonosítatlan művek listáján dolgozom. A 2025-ös adatok szerint a nevedhez **[N] mű** kapcsolódik olyan tételeknél, ahol a felosztás még nem történt meg — főleg **[film / streaming / TV / külföldi]** forrásokból.
>
> Röviden összefoglalót tudok küldeni: mely címek, milyen felosztási típusok, és mi a valószínű teendő (regisztráció / matching / reklamáció). Nem ügyvédi panasz, hanem metaadat-audit.
>
> Ha érdekel, írj vissza — ha nem aktuális, elnézést a zavarásért.
>
> Üdv,  
> Horváth Renátó

**Ne ígérj:** konkrét összeget, garantált recovery-t.

---

## 1. Moldvai Márk

| Leaderboard | Audit (névkeresés) |
|-------------|-------------------|
| 161 mű, 1082 film sor, 4 strm | 150 ARTISJUS találat, + GVL (4), SOZA (1) |

**Profil:** filmzenész — dominánsan SEFAA/SVFAA típusú tételek.

**Személyre szabott mondat:**  
*„A 2025-ös ARTISJUS listán a nevedhez több mint 150 filmes/zenei tétel kapcsolódik azonosítatlan státuszban — pl. 1849 című sorozathoz több cue is szerepel.”*

**Példa címek (audit):** 1849_HALÁLBÜNTETÉS, 1849_TESTVÉRSÉG

```bash
npm run batch:artist-audit -- "Moldvai Márk"
```

---

## 2. Wettl Mátyás

| Leaderboard | Audit |
|-------------|-------|
| 143 mű, ~1607 film sor | 143 ARTISJUS találat, AKM (1) |

**Profil:** film / media kompozíció.

**Személyre szabott mondat:**  
*„143 egyedi műved szerepel az azonosítatlan listán, többségében filmes felosztási sorokkal — pl. Ajándékvadászat, Átváltozás.”*

**Példa címek:** AJÁNDÉKVADÁSZAT, ÁTVÁLTOZÁS, AVARKUPACOK

```bash
npm run batch:artist-audit -- "Wettl Mátyás"
```

---

## 3. Mészáros János

| Leaderboard | Audit |
|-------------|-------|
| 67 mű, 213 strm sor | 81 ARTISJUS találat |

**Profil:** streaming-heavy (TNSAA/NSAA) — közelebb a „klasszikus” kiadói/streaming problémához.

**Személyre szabott mondat:**  
*„A listán 67 műved van, és a felosztási sorok nagy része zenei streaming (nem film) — ez gyakran metadata / IPI / matching kérdés.”*

**Példa címek:** ADJUNK A GYEREKNEK NEVET, AKKOR JÓ HA NEKEM JÓ

```bash
npm run batch:artist-audit -- "Mészáros János"
```

---

## 4. Melis László

| Leaderboard | Audit |
|-------------|-------|
| 53 mű, 576 film + 9 TV | 64 ARTISJUS találat |

**Profil:** film + kevés TV (AT/RAT*).

**Személyre szabott mondat:**  
*„53 mű, vegyesen filmes és TV-s felosztási sorokkal — pl. Céllövölde, Csárdás szerepel azonosítatlan státuszban.”*

**Példa címek:** CÉLLÖVÖLDE, CSÁRDÁS, CSÓNAKKAL A KUNYHÓHOZ

```bash
npm run batch:artist-audit -- "Melis László"
```

---

## 5. Barabás Béla

| Leaderboard | Audit |
|-------------|-------|
| 45 mű, 147 film + 147 TV | 89 ARTISJUS találat |

**Profil:** erős TV komponens — érdemes hangsúlyozni (TV soronként nagyobb lehet a tét, mint streaming).

**Személyre szabott mondat:**  
*„45 művednél a felosztási sorok fele TV-s, fele filmes típus — pl. Before the War, Bethlen cue-k.”*

**Példa címek:** BEFORE THE WAR, BETHLEN_CUE 01

```bash
npm run batch:artist-audit -- "Barabás Béla"
```

---

## 6. Björkvall Oliver Hans Jacob

| Leaderboard | Audit |
|-------------|-------|
| 100 mű, 192 kulf (KA/KM) | 103 ARTISJUS + GVL (16), EEL (1) |

**Profil:** külföldi reciprocity — multi-territoriális pitch.

**Személyre szabott mondat:**  
*„100 mű, és a tételek jelentős része külföldi CMO reciprocity (KA/KM) — a pénz külföldön akadt el, ARTISJUS nem tudta kiosztani. Emellett GVL listán is van találat.”*

**Példa címek:** 20TH CENTURY NOISE, ADAMANT

```bash
npm run batch:artist-audit -- "Björkvall Oliver"
```

---

## 7. Czeichner Tamás

| Leaderboard | Audit |
|-------------|-------|
| 52 mű, 171 strm | 63 ARTISJUS találat |

**Profil:** production / library, streaming.

**Személyre szabott mondat:**  
*„52 mű, 171 zenei streaming sor — tipikus library szerzői profil, ahol az ISWC/IPI összekötés szokott elakadni.”*

**Példa címek:** ADVENTURE RHYTHM, ALIEN FUNK

```bash
npm run batch:artist-audit -- "Czeichner Tamás"
```

---

## 8. Madarász Gábor

| Leaderboard | Audit |
|-------------|-------|
| 37 mű, 455 film | 48 ARTISJUS találat |

**Profil:** film + ismert pop/koncert kapcsolódások.

**Személyre szabott mondat:**  
*„37 mű filmes felosztással, köztük koncert és film cue-k (pl. Rúzsa Magdolna aréna intro).”*

**Példa címek:** AMÍG ÉLEK JÁTSZOM, INTRO (RÚZSA MAGDOLNA ARÉNA KONCERT)

```bash
npm run batch:artist-audit -- "Madarász Gábor"
```

---

## 9. Presser Gábor

| Leaderboard | Audit |
|-------------|-------|
| 33 mű, 304 film | 56 ARTISJUS + SOZA (8), GVL (5), INTERGRAM (3) |

**Profil:** ismert szerző — óvatos, professzionális hang; multi-CMO.

**Személyre szabott mondat:**  
*„A nyilvános listán 33 mű szerepel a neved alatt, és az audit több EU CMO listán is találatot ad (GVL, SOZA) — portfólió-szintű áttekintés hasznos lehet.”*

**Példa címek:** ARRA SZÜLETTÜNK, ÁTKÖTŐ ZENE

```bash
npm run batch:artist-audit -- "Presser Gábor"
```

---

## 10. Balázs Ádám

| Leaderboard | Audit |
|-------------|-------|
| 54 mű, 380 film | 100 ARTISJUS találat |

**Profil:** film / dráma zenék.

**Személyre szabott mondat:**  
*„54 mű, túlnyomórészt filmes felosztási sorokkal — pl. Álomszuszék óriás, Aranypálca.”*

**Példa címek:** ÁLOMSZUSZÉK ÓRIÁS (AZ), ARANYPÁLCA (AZ)

```bash
npm run batch:artist-audit -- "Balázs Ádám"
```

---

## Batch futtatás

```bash
bash scripts/outreach/run_pitch_audits.sh
```

Publisholt riport (opcionális, Neon kell):

```bash
npx tsx scripts/batch_artist_audit.mjs --publish "Moldvai Márk" "Wettl Mátyás"
```

UI: `npm run dev` → http://localhost:3002 → előadónév keresés.

---

## Következő lépés outreach után

1. Válasz → futtasd újra auditot `--publish`-szal, küldd a `/r/[token]` linket.  
2. 15 perces call: mely címek aktívak, van-e ARTISJUS regisztráció, ki kezeli a katalógust.  
3. Mérföldkő: első 2–3 sikeres reklamáció / matching case study.

**MLC az adatgépen:** `.venv/bin/pip install duckdb` + `catalog.duckdb` — akkor az USA mechanikai oldal is bekerül az auditba.
