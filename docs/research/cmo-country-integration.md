# CMO országonkénti integrációs térkép

A `European_CMO_Unidentified_Works_Registry_Report_Corrected.txt` (CRM Art. 13) és a projekt jelenlegi állapota alapján.

**Jelölések**

| Jel | Jelentés |
|-----|----------|
| ✅ | Bekötve az appban |
| 📥 | Bulk letöltés → `cmo:build-index` (mint AKM/SENA) |
| 🌐 | Nyilvános webkereső → `lib/cmo-web/` adapter |
| 🔒 | Tagi login / nincs publikus adat |
| ❌ | Nincs azonosítható nyilvános lista |
| ⚠️ | PDF / részleges / parse macera |

**Megjegyzés:** A riport **nem említi a SENA-t** (Holland szomszédos jog); a NORMA és BUMA/Stemra szerepel helyette. A SENA XLSX-eket közvetlenül a CMO-tól kapjuk.

---

## Összefoglaló — hol van mindkét jogág integrálható?

| Ország | Szerzői CMO | Szomszédos CMO | Mindkettő? | Következő lépés |
|--------|-------------|----------------|------------|-----------------|
| **HU** | ARTISJUS ✅ | EJI 🌐 ✅ | **Igen** | — |
| **AT** | AKM ✅ + AUME ✅ | LSG ❌ | Részben | LSG: nincs lista |
| **NL** | BUMA/Stemra 🔒 | SENA 📥 ✅ | Részben | BUMA: Airplayclaim web? |
| **RO** | UCMR-ADA ⚠️ | CREDIDAM 📥 | **Közel** | PDF + Excel index |
| **EE** | EAÜ 📥🌐 | EEL 📥 | **Közel** | CSV/Excel letöltés |
| **FR** | SACEM 🌐 | SPEDIDAM 🌐 | **Közel** | ONI + ILAD adapter |
| **SE** | STIM 📥 | SAMI 🌐 | **Közel** | XLSX + web adapter |
| **DK** | KODA 📥🌐 | Gramex DK ❌ | Részben | KODA Excel |
| **PL** | ZAiKS 🌐 | STOART/SAWP ❌ | Részben | ZAiKS adapter |
| **CZ** | OSA 🔒 | INTERGRAM 📥 | Részben | INTERGRAM Excel |
| **FI** | TEOSTO 🔒 | Gramex FI 📥 | Részben | Gramex Excel |
| **HR** | HDS-ZAMP 📥 | HUZIP/ZAPRAF ❌ | Részben | HDS-ZAMP Excel |
| **SK** | SOZA 📥 | SLOVGRAM ⚠️ | Részben | SOZA + SLOVGRAM |
| **BG** | MUSICAUTOR ⚠️ | — | Részben | PDF parse |
| **ES** | SGAE ⚠️ | AIE ❌ | Részben | SGAE PDF |
| **UK** | PRS ⚠️ | PPL 🔒 | Részben | PRS PDF sávok |
| **DE** | GEMA 🔒 | GVL ❌ | Nem | Email-on-request |
| **IT** | SIAE 🔒 | IMAIE ❌ | Nem | — |
| **BE, GR, PT, LV, LT, CY, MT, IS, NO, CH** | ❌/🔒 | ❌ | Nem | — |

---

## Országonkénti részletek

### 🇭🇺 Magyarország — **kész (mindkét jogág)**

| Jog | CMO | Formátum | App |
|-----|-----|----------|-----|
| Szerzői | ARTISJUS | CSV | ✅ `artisjus:build-index` |
| Előadói | EJI | Web (Kendo) | ✅ `lib/cmo-web/eji-*` |

---

### 🇦🇹 Ausztria — **szerzői kész**

| Jog | CMO | Formátum | App |
|-----|-----|----------|-----|
| Szerzői | AKM | XLSX Anfrageliste | ✅ |
| Mechanikai | AUME | XLSX | ✅ |
| Előadói | LSG | Nincs publikus lista | ❌ |

---

### 🇳🇱 Hollandia — **szomszédos kész**

| Jog | CMO | Formátum | App |
|-----|-----|----------|-----|
| Szerzői | BUMA/Stemra | Tagi / Airplayclaim | 🔒 |
| Szomszédos | **SENA** | `ongeclaimd-nederland.xlsx` + `ongeclaimd-buitenland.xlsx` | ✅ ~390k sor |
| (Riport) | NORMA | None | ❌ — más szervezet, nem SENA |

---

### 🇷🇴 Románia — **legjobb következő bulk páros**

| Jog | CMO | Formátum | Integráció |
|-----|-----|----------|------------|
| Szerzői | UCMR-ADA | Havi PDF (2018 óta) | ⚠️ PDF pipeline |
| Szomszédos | CREDIDAM | Excel (rádió + TV) | 📥 prioritás |

---

### 🇪🇪 Észtország

| Jog | CMO | Formátum | Integráció |
|-----|-----|----------|------------|
| Szerzői | EAÜ | Web + CSV export | 📥 |
| Szomszédos | EEL | Excel | 📥 |

---

### 🇫🇷 Franciaország

| Jog | CMO | Formátum | Integráció |
|-----|-----|----------|------------|
| Szerzői | SACEM ONI | Web EN/FR | 🌐 prioritás |
| Szomszédos | SPEDIDAM ILAD | Web | 🌐 (EJI párja) |
| Szomszédos | ADAMI | Tagi | 🔒 |

---

### 🇸🇪 Svédország — **riport szerint egyetlen „teljes” EU példa (STIM+SAMI)**

| Jog | CMO | Formátum | Integráció |
|-----|-----|----------|------------|
| Szerzői | STIM | Negyedéves XLSX (~9 MB) | 📥 |
| Szomszédos | SAMI | Web search | 🌐 |

---

### 🇩🇰 Dánia

| Jog | CMO | Formátum | Integráció |
|-----|-----|----------|------------|
| Szerzői | KODA | Web + Excel export | 📥🌐 |
| Szomszédos | Gramex DK | Csak transzparencia riport | ❌ |

---

### 🇵🇱 Lengyelország

| Jog | CMO | Formátum | Integráció |
|-----|-----|----------|------------|
| Szerzői | ZAiKS | Web ~51k bejegyzés | 🌐 |
| Szomszédos | STOART, SAWP | Nincs lista | ❌ |

---

### 🇩🇪 Németország — **blokkolva**

GEMA: tagi „Nutzungen identifizieren” vagy email PDF (VGG §29). GVL: nincs publikus lista.

---

### 🇬🇧 Egyesült Királyság

PRS: PDF/CSV értéksávokban (havi). PPL: nincs publikus performer lista.

---

## Javasolt sorrend (bulk → web)

1. **RO** CREDIDAM Excel + UCMR-ADA PDF
2. **SE** STIM XLSX
3. **SK** SOZA XLSX
4. **HR** HDS-ZAMP Excel (3 fájl)
5. **EE** EAÜ CSV + EEL Excel
6. **CZ** INTERGRAM Excel
7. **FI** Gramex Excel
8. **🌐** ZAiKS → SACEM ONI → SPEDIDAM ILAD → SAMI → KODA

---

## Fájlok ezen a gépen

Lásd `SOURCES.md` — `raw/cmo/` alatt.

```bash
npm run cmo:build-index   # AKM, AUME, SENA (nederland + buitenland)
npm run artisjus:build-index
```
