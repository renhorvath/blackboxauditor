# EJI hangfelvételi sablonok (PoC)

Hivatalos forrás: [EJI hangfelvételi adatlap](https://eji.hu/record/hangfelveteli_adatlap/hu/fd/fd)

| Fájl | Jelentés |
|------|----------|
| `hangfelveteli_adatlap_excel_sablon_official.xls` | Batch feltöltő sablon (`https://eji.hu/download/record/excel/hu`), max 300 sor, formátum **xls** |
| `hangfelveteli_adatlap_excel_sablon.xlsx` | Ugyanaz a mezőkészlet, olvasható xlsx másolat |
| `hangfelveteli_adatlap_komolyzene.pdf` | Komolyzenei kitöltési útmutató (mű + tételek, karmester = szólista) |

**Mezők (v1.111):** cím, album, együttes/szólista, szólista|tag jelölés, zenekar létszám, karmester/karvezető, hangszeres, énekes, prózamondó, kiadó*, év*, ISRC.

PoC UI: `/demo/eji-poc` — CSV a sablon oszlopaira.
