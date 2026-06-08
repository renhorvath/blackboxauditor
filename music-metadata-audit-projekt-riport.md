# Music metadata audit projekt — összefoglaló riport és adatforrás-bővítési terv

Ez a dokumentum a chatbeszélgetés teljes anyagát foglalja össze, és arra fókuszál, hogy a már Cursorban épülő, credits.fm-re alapuló eszközt milyen új adatforrásokkal és funkciókkal érdemes kibővíteni. Referenciaként használható, ahogy a projekt fejlődik.

---

## 1. Hol tartunk most

A projekt kiindulópontja egy európai jogosultaknak szóló metaadat-auditor volt, amely a credits.fm API-ját használva műszintű hibákat azonosít — hiányzó ISWC, unmatched MLC-státusz, hiányos share-allokáció. A Cursorban már elkezdtél építeni egy ilyen prototípust.

A beszélgetés során az eszköz koncepciója lényegesen átalakult. Két fontos elmozdulás történt:

Az első, hogy az MLC-központú megközelítés helyett **európai oldalra került a hangsúly**. Az ARTISJUS azonosítatlan művek listájának feldolgozása nagyobb és közvetlenebbül releváns piacot mutat, mint az MLC-hez kötődő amerikai oldal.

A második, hogy a **B2C zenész célzás üzletileg nem skálázható**. Az átlagos azonosítatlan tétel értéke túl alacsony ahhoz, hogy egyetlen zenész darab szinten fizessen érte. A reális célpiac kiadók, katalóguskezelők, menedzserek és kis független publisherek — akik portfólió-szinten kezelik a problémát.

Ezen kívül megerősítést kapott, hogy a projekt **dokumentált adatra épül, nem hipotézisre**. Az ARTISJUS lista 86 ezer oldal, 91 ezer egyedi mű egy évre. Az EUIPO 2026 májusi tanulmánya hivatalosan kimondja a fekete doboz jelenséget. A CRM-direktíva 13. és 18. cikke explicit publikációs kötelezettséget ír elő, amelyet a CMO-k formálisan teljesítenek, de gyakorlatilag használhatatlan formában.

---

## 2. Az öt fő tanulság a problémáról

### 2.1. Az azonosítók négyrétegű rendszere

A jogdíjfolyam négy különböző azonosító-rétegre épül: a műre (ISWC), a felvételre (ISRC), a kiadásra (UPC/GRid) és a személyre (IPI, ISNI). Ezek mindegyikének hiánya vagy hibája más típusú jogdíjat akadályoz. Egy hiányzó ISWC a publishing oldali jogdíjat töri meg. Egy hiányzó IPI a szerző azonosíthatóságát rontja el. Egy szétcsúszott ISRC több felvételre az adott felvétel lejátszási adatait szétaprózza. Az auditornak ezeket külön kell tudni jelezni, mert a teendők is különböznek.

### 2.2. A black box jelenség strukturális, nem véletlen

Az EUIPO tanulmánya és a CRM-direktíva 13. cikkének elemzése együttesen mutatja, hogy a fekete doboz nem hibás működés eredménye, hanem a rendszer szándékolt működése. A 13. cikk "objektív akadály" kivétele legalizálja az azonosítatlan jogdíj tartását, a 24. cikk "where feasible" záradéka levezeti a CMO felelősségét, a 18. cikk pedig csak az attribútált összeget mutatja a jogosultnak. A nem-attribútált pénz láthatatlan.

### 2.3. Az ARTISJUS lista tartalmaz híres magyar előadókat

A 2022-es listán ott szerepel Omega (25 egyedi mű), Illés (83), Republic (29), Lagzi Lajcsi (20), Zorán (10), Bikini (14), Edda (12), Cseh Tamás (36). Több esetben — például Omega "Family Strong" — a jogosult ott van a sorban (Kóbor János), mégis unmatched státuszban. Vagyis az adat ott van, csak a kapcsolat nem jött létre a felosztási rendszerrel. Ez ARTISJUS belső matching problémát jelez, nem alapvető adat hiányát.

### 2.4. A külföldi CMO-k a probléma jelentős részét adják

**2022-es lista:** a 91 547 egyedi mű közül 41 804 — körülbelül 45 százalék — kizárólag külföldi közös jogkezelőtől származott. Top küldők: SACEM (20 357 sor), STIM (14 229), PRS (8 614), NCB (8 572), GEMA (3 303).

**2025-ös lista (frissített, CSV-alapú mérés):** a 188 535 egyedi mű közül **43 951 (23,3%)** tartalmaz legalább egy külföldi reciprocity-sort (`KA`/`KM` felosztási típus), és **41 391 (22,0%)** kizárólag külföldi forrásból származik. Figyelemre méltó, hogy az abszolút szám (≈41 ezer tisztán külföldi mű) gyakorlatilag változatlan 2022 óta, miközben a teljes mű-állomány több mint duplájára nőtt — vagyis a hazai (gépzene, streaming, rádió) black box nőtt arányában gyorsabban, nem a külföldi reciprocity.

A 2025-ös top külföldi küldők (KA+KM sorok CMO-nként, az `elhangzasi_info` mezőből aggregálva):

| CMO | Ország | KA+KM sor |
|---|---|---|
| STIM | Svédország | 24 958 |
| GEMA | Németország | 17 040 |
| NCB | Skandinávia (NO/DK/FI) | 10 144 |
| PRS | Egyesült Királyság | 6 402 |
| SUISA | Svájc | 3 017 |
| MCPS | Egyesült Királyság | 2 325 |
| STEMRA | Hollandia | 2 055 |
| BUMA | Hollandia | 1 997 |
| SABAM | Belgium | 888 |

> Megjegyzés: a 2022-es és 2025-ös sorszámok eltérő mérési módszerből származnak (a 2025-ös a `KA`/`KM` reciprocity-sorokat számolja CMO-token szerint), így a küldők rangsora évek között nem közvetlenül összevethető. A 2025-ös összetétel jól láthatóan a skandináv/német tengely felé tolódott (STIM, GEMA, NCB dominál), míg a 2022-ben első SACEM 2025-ben már alig jelenik meg.

Ezek a CMO-k a saját rendszerükből továbbküldött pénzhez sem tudtak jogosultat rendelni, és ARTISJUS-ra hárították a matching feladatot. Ez azt jelenti, hogy a magyar fekete doboz jelentős része nemzetközi reciprocity-szilánk, és elvben minden külföldi CMO listáján szerepelhetnek hasonló helyzetben magyar művek — **de a gyakorlatban a külföldi listák nem tükrözik vissza ezeket a tételeket** (lásd 4.7).

A forrás-fájlok: `artisjus_azonositatlan_muvek_2022.csv` … `_2025.csv` és a `artisjus_cmo_lookup_2025.csv` (CMO → ország → jogtípus → sorszám) a `/Users/ren/synchreload/` mappában; a parser a `scripts/mlc/parse_artisjus_pdf.py`.

### 2.5. A platformok két különböző fizetési modellt használnak

Spotify, Apple, Netflix, Google Play műszintű felhasználási adatot küld a CMO-nak. YouTube, TikTok, Instagram (Meta) blanket license vagy átalány alapján fizet — a CMO ezt nem tudja konkrét műhöz kötni, hanem felosztási kulcs alapján szétosztja. A YouTube Content ID-jén keresztül a pénz közvetlenül a Content ID-partneren át megy, gyakran sosem ér el ARTISJUS-ig. Ezért nincsenek a YouTube és TikTok tételek az ARTISJUS unmatched listán — nem azért, mert minden rendben van, hanem mert máshogy láthatatlan probléma. Ez egy harmadik réteg, amit külön kell kezelni.

---

## 3. A jelenlegi Cursor projekt erősségei és határai

A credits.fm-re épülő eszköz logikája az eredeti spec alapján:

- ISRC-lista bemenete (CSV, Spotify URL, kézi beírás)
- Batch lekérdezés a credits.fm `/v1/batch`, `/v1/audit/shares`, `/v1/audit/unmatched` végpontjain
- Audit-riport: ISWC megléte, MLC match státusz, share-teljesség, IPI azonosítása
- Issue-generálás magyar nyelvű leírással és javasolt lépésekkel

Ennek az erőssége, hogy azonnal működik, nem kell hozzá intézményi együttműködés, és felvétel szintű (ISRC) bemenetre épít, ami sok jogosultnál elérhető.

A határai viszont jelentősek. A credits.fm az MLC adataira épít, ami az USA mechanikai jogdíj-helyzetet mutatja. Egy magyar jogosult számára ez egy szelet — az európai jogdíj-helyzet (ARTISJUS, EJI, külföldi CMO-k) ezzel nem fedhető le. Pontosan ezért érdemes új adatforrásokkal kiegészíteni.

---

## 4. Új adatforrások — prioritás szerint

### 4.1. ARTISJUS azonosítatlan művek lista (CSV) — magas prioritás

Ez a projekt eddigi legértékesebb új adatforrása. 9 oszlop: sorszám, műkód (ARTISJUS belső), műcím, előadók, jogosultak, zeneműkiadó, hangfelvételkiadó, felo.tip kód, elhangzási információk. Mind a négy évjárat fel van dolgozva CSV-be (deduplikálás nélkül, soronként egy felosztási tétel), a `scripts/mlc/parse_artisjus_pdf.py` parserrel, a `/Users/ren/synchreload/` mappában:

| Évjárat | PDF oldal | CSV sor | Egyedi műkód |
|---|---|---|---|
| 2022 | 12 682 | 148 701 | 91 547 |
| 2023 | 59 999 | 575 731 | 147 843 |
| 2024 | 71 034 | 697 197 | 170 766 |
| 2025 | 86 515 | 785 741 | **188 535** |

A 2025-ös egyedi műszám tehát **188 535** (a korábbi ~151 ezres becslés nyers-szöveg alapú alulszámolás volt; a CSV minden műkódja jól formált `400…` 10 jegyű kód, zéró hibás). A lista **nem kumulatív**: évenkénti pillanatkép, a művek be- és kikerülnek (2022→2025 között a 2022-es műkódoknak csak ~38%-a van még a 2025-ös listán).

**Mit ad hozzá az eszközhöz:**

Az ARTISJUS lista nem ISRC-alapú, hanem műcím-, előadó- és jogosultnév-alapú. Ezért a credits.fm-féle ISRC-bemenet itt nem közvetlenül használható. A felhasználó vagy beír egy nevet/címet, vagy feltölt egy listát az eddigi munkáiról.

Konkrét feature-ök, amik erre építhetők:

- **Műcím alapú keresés**: a felhasználó keres az előadó vagy a saját neve alapján, és látja, melyik művei szerepelnek a listán. Ehhez egy egyszerű full-text index elég (sqlite FTS5, vagy Meilisearch/Typesense).
- **Fuzzy névegyezés**: a Tamás Lukásczik / Tom Lumen típusú esetekhez szükséges. A magyar nevek ékezetes és ékezet nélküli variánsai, művésznév/polgári név disambiguation. Egy elasticsearch-szerű fuzzy match vagy egy konkrét levenshtein-alapú scoring.
- **Forrás-aggregáció és scoring**: ugyanaz a műkód több sorban szerepel különböző felosztási típusokkal és forrásokkal. A felhasználó egy találati blokkban lássa az összes forrást: hány DSP, hány külföldi CMO, milyen hazai felhasználók. Több külföldi CMO-forrás magasabb prioritást jelez.
- **Felo.tip kódszótár**: a 696 különböző kód jelenleg ARTISJUS-belső. Megfejtésük lépésről lépésre dokumentálható: TNSAA, TNDAA, RNSAA, RNSAM, NSAA, NSAM, KA, KM, HENY, AS, ASUH, MB, CLD stb. Ez önmagában értékes belső dokumentáció.

**Implementációs javaslat:**

A CSV parsoláshoz nincs szükség külön szolgáltatásra. Indítsd Postgres-ben vagy sqlite-ban egy `artisjus_unmatched` táblával, normalizálva (egy mű → egy sor, és külön `sources` tábla a forrásokra). Az éves frissítés (ARTISJUS minden évben publikálja az új listát) batch importtal megoldható.

Ami később jön: tartsd meg az évek közötti változást, hogy lehessen monitorozni: "tavaly még a listán volt, idén már nincs" = valószínűleg matchelték, és "tavaly még nem volt, idén megjelent" = új keletű unmatched.

### 4.2. MLC unmatched listák (CSV) — közepes prioritás

Az MLC nyilvánosan publikál unmatched listákat. Te már dolgoztál egy magyar mintával (40 sor) és egy konkrét bandával (Jazzbois, 454 sor / 96 egyedi ISRC). Az MLC felülete kereshető a `https://portal.themlc.com/` felhasználói felületen, és van bulk export is.
/Users/ren/autotrader/unmatchedresources.tsv néven le van mentve a jelenlegi 121gb-os unmtached MLC lista. 

**Mit ad hozzá:**

A credits.fm már részben tükrözi az MLC adatait, de csak ISRC szinten és csak az audit-végpontokon keresztül. A teljes MLC unmatched feldolgozása lehetővé teszi:

- **Magyar ISRC-prefixek (HUA, HUB, HUC, HUUM, HUMAG stb.) szűrése** — kifejezetten hazai katalógusokra fókuszálva.
- **Külföldi distributoron kiadott magyar zenészek megtalálása** — a jazzbois esetén látszott, hogy a magyar banda ISRC-i nagyrészt német és francia distributoroktól vannak. Ezeket csak az MLC oldali keresés tárja fel.
- **Cross-check a credits.fm-mel** — ha credits.fm "matched"-et mond, az MLC unmatched-et, az diszkrepancia és érdemes utánajárni.

**Implementációs javaslat:**

Az MLC bulk export ZIP formátumban érhető el. Az API-juk fejlesztői hozzáférést igényel, de a CSV-export saját kezűleg processzelhető. Hozz létre egy `mlc_unmatched` táblát, és az ARTISJUS-szal párhuzamosan tartsd. Egy mű két listán szereplése (ARTISJUS + MLC) a legmagasabb prioritás.

### 4.3. CISAC ISWC nyilvános kereső — alacsony-közepes prioritás

A CISAC ISWC adatbázisa nyilvánosan kereshető a `https://iswcnet.cisac.org/` felületen, de nincs hivatalos publikus API. A web-alapú lekérdezés azonban ISWC-szám, műcím vagy szerző alapján működik.

**Mit ad hozzá:**

Az ISWC ellenőrzése pont az a hiányzó kapcsolat, ami a black box egyik fő mechanizmusát okozza. Ha egy felvételhez (ISRC) nincs hozzárendelt mű (ISWC), a publishing oldali jogdíj nem indul el. A credits.fm-ben szerepel ISWC, de csak ahol az MLC vagy a MusicBrainz tudja. A CISAC nyilvános keresője szélesebb forrás.

**Implementációs javaslat:**

Itt két út lehet. Az egyik a manuális ellenőrzés sablon: ha a felhasználó ISRC-jét credits.fm "ISWC hiányzik"-kel jelöli meg, az eszköz egy kattintásra megnyitja az ISWCnet-en a műcím-alapú keresést. A másik egy automatizált scraping, de ez jogilag és technikailag kérdéses. Az első út a biztonságosabb induláskor.

### 4.4. MusicBrainz nyílt adatbázis — közepes prioritás

A MusicBrainz teljesen nyílt, dump letölthető, API ingyenes (10 req/sec). Sokkal részletesebb metaadatot tartalmaz, mint a credits.fm — előadói relációk, kiadói lánc, alternatív címek, alternatív ISRC-k.

**Mit ad hozzá:**

- **Alternatív ISRC-k egyazon felvételhez** — közvetlenül azonosítja a "több ISRC ugyanahhoz a dalhoz" problémát.
- **Előadói és zeneszerzői név-variánsok** — segít a fuzzy match-nek.
- **A felvételhez tartozó kiadások aggregálása** — látszik, hogy a felvétel hány különböző albumon szerepel, és melyek aktívak.

**Implementációs javaslat:**

Két út: az API ad-hoc lekérdezésre alkalmas, a teljes dump (cca. 25 GB) helyi tárolásra. Egy közepes méretű projekthez az API mellett egy szelektív cache elég, kifejezetten a magyar és magyar relevanciájú felvételekre. A dump letöltése csak akkor érdemes, ha a használat skálázódik.

### 4.5. Spotify Web API — alacsony prioritás (de hasznos)

A Spotify Web API ingyenes, track URI vagy URL alapján visszaad metaadatokat, beleértve az ISRC-t.

**Mit ad hozzá:**

- **Egy zenész teljes Spotify-katalógusának listázása** — alapja a "katalógus-audit" feature-nek.
- **ISRC kinyerése Spotify URL-ből** — felhasználóbarát belépőpont, mert sok zenész inkább a Spotify-linket másolja, mint az ISRC-t.

**Implementációs javaslat:**

A Spotify API már szerepel az eredeti specifikációban (URL resolution). Bővítheted az artist-szintű katalóguslekérdezéssel: bemenet Spotify Artist URL, kimenet az összes track ISRC-vel.

### 4.6. YouTube Content ID / Data API — speciális eset

A YouTube Data API public, de Content ID jelentések csak a partnereknek érhetők el. Egyszerű ellenőrzés:

- **"Music in this video" panel megléte** — egy YouTube videó URL-jéből megnézhető, hogy a Content ID hozzárendelte-e a zenét és kit (`yt-dlp` segítségével vagy közvetlen HTML scrape-pel).

**Mit ad hozzá:**

Az ARTISJUS-cikk hat feltételt sorol fel a YouTube-os szerzői jogdíj keletkezéséhez. Ezek közül egyetlen feltétel automatikusan ellenőrizhető: van-e "Zene a videóban" panel az adott videó alatt. Ha egy zenész azt mondja, hogy 100 ezer megtekintésű videója van, és nincs ilyen panel, az konkrét jelzés a hibára.

**Implementációs javaslat:**

Ez kísérleti feature lehet később. Egy zenész feltölti a saját YouTube-videóinak linkjeit, az eszköz lefutja rajtuk a panel-ellenőrzést, és listázza, melyek nem azonosítottak.

### 4.7. Hosszú távú: más európai CMO-k publikus listái

A CRM-direktíva 13. cikke alapján minden európai CMO köteles publikálni az azonosítatlan művek listáját. A formátumok és gyakorlatok azonban erősen eltérnek, és **nincs EU-szintű központi registry** — mindenki maga, a saját honlapján teszi közzé. A 2025 májusában elvégzett ellenőrzés (a top reciprocity-küldőkre) az alábbi képet adja a tényleges letölthetőségről:

| CMO | Ország | Publikáció státusza | Hozzáférés |
|---|---|---|---|
| ARTISJUS | HU | Excel/PDF, éves, műszintű | ✅ Publikus letöltés (referencia) |
| SUISA | CH | Inquiry List PDF (zene + film) | ✅ Publikus letöltés |
| AKM | AT | Anfrageliste PDF/XLS + nem azonosítható jogosultak | ✅ Publikus letöltés |
| AUSTRO-MECHANA | AT | AKM-mel közös publikáció | ✅ Publikus letöltés |
| PRS / MCPS | UK | „Claim unpaid royalties" — részben letölthető listák + tagi claim | ⚠️ Részben publikus |
| GEMA | DE | VGG §29 listák (4 kategória), letölthető; inquiry listák tagoknak | ⚠️ Részben publikus |
| SACEM | FR | ONI = azonosítatlan művek webes **kereső**; külön fájl a nem lokalizált jogosultakról | ⚠️ Web search, nem bulk |
| BUMA/STEMRA | NL | Airplayclaim — rádió/TV, webes hallgatás/keresés | ⚠️ Web search, nem bulk |
| STIM | SE | Elhunyt jogosultak listája publikus; teljes unregistered-works lista bizonytalan | ⚠️ Részleges |
| SOCAN / OSA / APRA | CA / CZ / AU | Unidentified list — csak tagi portálon | 🔒 Csak tagoknak |
| SGAE / BMI | ES / USA | Nincs Art. 13-szerű publikus lista (csak repertórium) | ❌ Nincs / N/A |
| NCB | NO/DK/FI | Mechanikai clearing house — nincs saját műlista | ❌ N/A |
| SABAM | BE | Jogi kötelezettség dokumentálva, publikus URL nem található | ❓ Ismeretlen |
| EAÜ | EE | CRM-kötelezettség megvan (UP-fájl tagoknak/partner-CMO-knak); publikus bulk letöltés nem található | 🔒 Főleg tagi |

Kulcsforrások (mind 200-as HTTP-vel ellenőrizve):
- ARTISJUS: https://www.artisjus.hu/egyesulet/ismeretlen-vagy-ismeretlen-helyen-tartozkodo-jogosultak/
- SUISA Inquiry List: https://www.suisa.ch/en/Musikschaffende/Werkanmeldung/Inquiry-List.html
- AKM Anfrageliste: https://www.akm.at/service/formulare-infos/
- PRS: https://www.prsformusic.com/royalties/claim-unpaid-royalties
- SACEM ONI: https://repertoire.sacem.fr/oeuvre-non-identifiee/recherche

**Fontos korlát (a B2B value prop szempontjából kritikus):** a külföldi listák **nem tükrözik vissza** az ARTISJUS `KA`/`KM` reciprocity-tételeit. Ezek más szakaszt mutatnak a jogdíjláncban: a külföldi CMO a **saját területén** felmerült azonosítatlan használatot listázza, nem azt, amit már továbbutalt ARTISJUS-nak. Konkrét ellenőrzés: a 2025-ös AKM Anfrageliste-ben (~76 ezer sor) a nagy nemzetközi nevek (Avicii, Beyoncé, Drake, Kanye) gyakorlatilag nem szerepelnek, miközben az ARTISJUS listán százas nagyságrendben — mert a slágerek a külföldi rádió/TV-monitoringban már azonosítva vannak, mire inquiry-listára kerülnének. Ezért egy magyar mű **csak akkor** bukkan fel pl. a GEMA/AKM listán, ha ott **lokálisan** maradt azonosítatlan — nem azért, mert ARTISJUS-nál `KA`/`KM` sorként szerepel.

**Mit ad hozzá:**

Itt jön be az "európai aggregátor" hosszabb távú víziója. Egy magyar zenész a SACEM listáján is szerepelhet, mert a francia rádiózás után járó jogdíja ott akadt el. Egyetlen eszköz, amely az összes európai CMO listájában keresni tud, valódi értékajánlatot képvisel — különösen multi-territoriálisan aktív katalógusoknak. A fenti letölthetőségi tábla viszont megmutatja, hogy reálisan **bulk-feldolgozható** csak az ARTISJUS, SUISA és AKM/Austro-Mechana; a többi web-kereső vagy tagi hozzáférés, így scraping vagy intézményi együttműködés kérdése.

**Implementációs javaslat:**

Ezt fokozatosan érdemes felvenni. Indulj az ARTISJUS-szal, érj el a működő MVP-ig, és amint van bizonyítható kereslet, terjeszd ki egy második CMO-ra. A 2025-ös letölthetőségi ellenőrzés alapján a **legkönnyebben bulk-feldolgozható** második forrás a **SUISA** vagy az **AKM/Austro-Mechana** (mindkettő publikus PDF/XLS lista), nem a GEMA — a GEMA VGG-listái csak részben publikusak, az inquiry listák tagi hozzáférést igényelnek. A GEMA így inkább harmadik lépés, vagy intézményi együttműködés esetén.

---

## 5. Hogyan illeszkedjen össze az architektúra

Az új adatforrásokkal a jelenlegi credits.fm-központú modell egy *több forrásból kereső, normalizáló és scoring-alapú* modellé alakul. A logika nagyjából:

1. **Bemenet réteg**: a felhasználó megadja az identitását (Spotify artist URL, név, vagy katalógus CSV ISRC-kkel és műcímekkel).
2. **Normalizáció**: az inputból az eszköz kinyeri a kereshető kulcsokat — műcímek, előadói nevek, ISRC-k, ISWC-k (ahol van).
3. **Multi-source lookup**:
   - credits.fm → ISRC-szintű audit (mint eddig)
   - ARTISJUS-tábla → műcím és név alapú teljes szöveges keresés
   - MLC-tábla → ISRC vagy név alapú keresés
   - MusicBrainz API → előadó és felvétel relációk
   - CISAC ISWCnet → manuális link a hiányzó ISWC-khez
4. **Aggregáció és scoring**: egy mű több forrásban való szereplése scoring-pontot ad. Egy mű 3+ külföldi CMO-forrással magas prioritás. Egy mű csak credits.fm-ben "ISWC hiányzik" alacsonyabb prioritás.
5. **Riport**: rangsorolt lista issue-kkal, javasolt lépésekkel, és — később — generálható claim-anyaggal.

Az architektúra szempontjából:

- Az új adatok importja batch ETL folyamat (heti, havi vagy az új lista megjelenésekor egyszeri).
- A keresés egy lokális index (Postgres full-text vagy Meilisearch) — nem hív minden lekérdezésnél külső API-t.
- A credits.fm marad real-time, mert az ISRC-szintű audit dinamikusan változhat.

---

## 6. Az üzleti modell kérdése

A B2C zenész-célzás üzletileg nem skálázható. A reális utak:

**B2B katalóguskezelők, kiadók, menedzserek.** Portfólió-szintű audit, havi vagy éves subscription. Egyetlen kiadónál 30-300 előadó katalógusa, és valamilyen tarifa havonta 50-200 ezer forint közötti tartományban realista. Az értékelés alapja nem az átlagos visszaszerezhető összeg darab szinten, hanem a teljes portfólió kockázat-csökkentése.

**Niche katalógusok, klasszikus zene.** A klasszikus felvételeknél több jogosult egyetlen műre, gyakoribb az azonosítatlanság. Hungaroton, MR Records, kisebb független kiadók, vagy közvetlenül a katalóguskezelő archívumok. Itt egy egyedi audit projekt is fizetőképes, ha a katalógus mérete nagy.

**Hosszú távon: multi-territoriális szolgáltatás.** Ahogy az ARTISJUS adatból látszik, a probléma közel fele nemzetközi reciprocity-szilánk. Az európai CMO-k listáin keresztül egy nemzetközileg aktív szerző vagy katalógus számára egyetlen szolgáltatás láthatóvá teszi a több országban "lebegő" tételeit. Ez egy egész más, magasabb értékű piac, de hosszabb építkezést igényel.

---

## 7. Konkrét case study-k és validáció

A beszélgetés során két konkrét eset került elő, amelyek demonstrációs anyagként és kiindulópontként is használhatók.

**Jazzbois (MLC):** 454 unmatched bejegyzés, 96 egyedi ISRC, 20 platform. 13 bejegyzésnek nincs ISRC-je. A banda magyar, de a 96 ISRC nagy része német, francia és brit distributoroktól származik. Ez tipikus külföldi-distributoron-keresztül-elveszett-magyar-tartalom-probléma. Velük együttműködve — engedélyükkel — készíthető egy első valós case study.

**Omega "Family Strong" és társai (ARTISJUS):** A 2022-es ARTISJUS listán Kóbor János jogosultként szerepel, Apple és Spotify forrással, mégis unmatched. Ez nem hiányzó adat — ez ARTISJUS belső matching problémája. Erős nyilvános demonstrációs anyag, mert mindenki ismeri Omega-t.

---

## 8. Konkrét következő lépések

**Rövid táv (1-4 hét):**

Importáld az ARTISJUS 2022-es CSV-t egy lokális adatbázisba (sqlite vagy Postgres elég). Építs egy egyszerű keresőt műcím és előadói név alapján. Tesztelj rajta saját és ismerős katalógusokkal. Csak ennyi — még semmilyen UI-csiszolás, semmilyen szolgáltatási csomagolás. Csak adat + kereső.

Készíts 2-3 demo-riportot ismert magyar előadókra (Omega, Lagzi Lajcsi, vagy egy aktív kortárs zenekar). Ezekkel mutathatod be a problémát kommunikációs vagy szakmai környezetben.

**Közép táv (1-3 hónap):**

Vond össze a credits.fm-es ISRC-szintű auditot az ARTISJUS-szintű név- és műcím-szintű audittal. Egy bemenet, kétféle elemzés, egy aggregált riport.

Vegyél fel 3-5 valódi pilot ügyfelet — kiadó, menedzser, esetleg egy distributor. Csináld nekik manuálisan az auditot. Nézd, milyen kérdéseket tesznek fel, mit kérnek pluszban, mi a fizetési hajlandóságuk.

Importáld az MLC bulk export legfrissebb verzióját, és építsd be a kereshetőségbe. Cross-check ARTISJUS és MLC között — ahol egy mű mindkét listán van, magasabb prioritás.

**Hosszabb táv (3-12 hónap):**

Csak akkor építs szoftvert, ha a manuális validáció megerősíti a fizetési hajlandóságot és a folyamatot. A Starter Story-s bootstrap sztorik egységesen ezt mondják: a kódot a kapcsolat után érdemes építeni.

A második európai CMO listájának feldolgozása. A 2025-ös letölthetőségi ellenőrzés szerint a legkönnyebben integrálható publikus, bulk-letölthető lista a **SUISA** és az **AKM/Austro-Mechana** (PDF/XLS); a GEMA csak részben publikus, ezért később vagy intézményi együttműködéssel jön. Itt indul az "európai aggregátor" valódi differenciálódása.

Zsófival közösen tisztázott jogi keret a CRM-direktívás hivatkozásokra. A 13. cikk publikációs kötelezettsége, a 18. cikk éves elszámolási kötelezettsége, és a 26. cikk dispute mechanizmusa azok a horgonyok, amikre a panaszgenerálási és audit folyamat épülhet.

---

## 9. Mit ne tegyél


- **Ne építs centralizált adatbázist.** A CopyrightView (EUIPO) intézményi lánca pont ezt csinálja. A ti pozíciótok a könnyű, jogosult-oldali, upstream eszköz. Ne ütközz a nagy intézményekkel olyan területen, ahol ők strukturálisan előnyben vannak.


---

## 10. Az új és a meglévő adatforrás összevetése

| Forrás | Bemenet | Kimenet | Lefedett probléma | Státusz |
|---|---|---|---|---|
| credits.fm | ISRC-lista | ISWC megléte, MLC match, share, IPI | USA mechanikai oldal, ISRC szintű audit | Integrálva |
| ARTISJUS unmatched CSV | Műcím, előadó, jogosult név | Hazai unmatched státusz, források, felo.tip | Magyar fekete doboz teljes lefedés (2022–2025, 188 535 egyedi mű 2025-re) | Feldolgozva (CSV) — magas prioritás |
| MLC bulk unmatched | ISRC vagy név | MLC unmatched státusz, részletes meta | USA fekete doboz, magyar ISRC-szűrés | Új — közepes prioritás |
| CISAC ISWCnet | ISWC, műcím, szerző | ISWC megléte vagy hiánya | ISWC-szintű ellenőrzés | Új — manuális link |
| MusicBrainz | ISRC, név | Alternatív ISRC-k, név-variánsok | Több ISRC ugyanahhoz a dalhoz | Új — közepes prioritás |
| Spotify Web API | URL, artist URL | ISRC-katalógus | Bemeneti kényelem | Részben meglévő |
| YouTube Data API | Video URL | Content ID panel megléte | YouTube struktúra | Új — kísérleti |
| Más európai CMO-k | Műcím, név | Multi-territoriális unmatched | Európai aggregátor | Hosszú táv |

---

## 11. Záró megjegyzés

A projekt értékének súlypontja átalakult. Eredetileg a credits.fm-re épülő technikai audit eszköz volt a központ. A beszélgetés végére az látszik, hogy a credits.fm csak az egyik komponens. A valódi differenciálódást az európai oldalon — különösen az ARTISJUS lista feldolgozásán és a más európai CMO-k bevonásán — keresztül érhető el. Ezzel a credits.fm már nem a termék magja, hanem egy a több forrás közül.

A B2B fókusz pedig az üzleti életképességet teszi reálissá. Egyetlen zenészen darab szinten nem lesz pénz, de portfólió-szinten egy kiadó vagy menedzser számára ez tényleges érték, és visszatérő bevétel.

Ezt a riportot tartsd kéznél, ahogy a Cursor projekt fejlődik. Az új adatforrások integrálási sorrendje és az architekturális javaslatok abban segítenek, hogy minden új réteg ne ad-hoc hozzáadás legyen, hanem egy átgondolt egészbe illeszkedjen.
