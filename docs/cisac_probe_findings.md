# CISAC ISWCnet API — probe findings

> Az `iswcnet.cisac.org` publikus API tényleges viselkedése, ahogy a session során
> kiprobáltuk. Cél: ezekre építeni az automatikus ISWC- és IPI-felderítést
> (`docs/audit_pipeline.md` Fázis 0).
>
> Kliens: `scripts/cisac/iswc_client.py`.

## Endpointok

| Endpoint | Bemenet | Kimenet |
|----------|---------|---------|
| `searchByIswc` | ISWC | mű + `interestedParties[]` (IPI/nameNumber!) |
| `searchByIpi` | IPI (name number) | az adott személy **teljes** ISWC-katalógusa |
| `searchByTitleAndContributor` | címek + vezetéknév | mű-jelöltek (cold-start IPI-hez) |

A láncolat logikája:
- **ISWC ismert** → `searchByIswc` → kinyerjük az IPI-t → `searchByIpi` → teljes mű-katalógus.
- **Semmi sem ismert (csak név+cím)** → `searchByTitleAndContributor` → jelöltekből
  IPI-szavazás → onnan `searchByIpi`.

## `searchByTitleAndContributor` — payload formátum (kínszenvedéssel kiderítve)

A `titles` **objektum-lista**, nem string-lista. A `type` **kötelező enum**:

```json
{
  "titles": [{ "title": "Ronga", "type": "OT" }],
  "lastName": "Szendrey Nagy"
}
```

- `titles` string-listaként vagy `{title}` objektumként → **400**.
- `type` érvényes értékek: `OT` (original), `AT`, `FT`, `PT`, `TE`. Hiányzó `type` → 400.
- Default a kereséshez: `OT`.

## Névnormalizálás — a CISAC keményen normalizál

A `lastName` szűrő szigorú; a CISAC a saját indexén normalizált alakot vár:

| Bemenet | CISAC-index | Találat |
|---------|-------------|---------|
| `Szendrey-Nagy Olivér` (kötőjellel) | — | **404** |
| `Szendrey Nagy` (kötőjel nélkül) | `SZENDREY NAGY OLIVER` | ✅ |

Normalizálási szabályok (replikálandó a megosztott normalizáló modulban):
1. **kötőjel → szóköz** (`Szendrey-Nagy` → `Szendrey Nagy`)
2. **diakritikák le** (`Olivér` → `OLIVER`)
3. **uppercase**
4. gyakorlatban a **vezetéknév-tokenek** a megbízható szűrő (keresztnevet a `type`/cím szűri)

> Tanulság: a `lastName`-be a normalizált vezetéknév-részt küldjük, ne a teljes,
> ékezetes, kötőjeles nevet.

## IPI / name-number ütközés → szavazás kell

A `TOPA FERENC` keresésnél **név↔szám kollíziót** észleltünk: ugyanahhoz a névhez
több name-number is társulhat (névrokonok, duplikált CISAC-rekordok). Ezért az
IPI-t **nem** szabad az első találatból elfogadni.

**Szavazó mechanizmus:**
1. Több ismert címre lefuttatjuk a `searchByTitleAndContributor`-t.
2. Minden találatból kigyűjtjük az `interestedParties[].nameNumber`-öket.
3. Az a name-number, amely **a legtöbb különböző címen** előjön, a győztes IPI.
4. Döntetlen / kevés szavazat / egyetlen forrás → **identity wizard** (ember dönt).

A nyers találatszám félrevezető — a **címek közti egyetértés** számít, nem a darabszám.

## Megerősítő kereszt-ellenőrzés

A megszavazott IPI-t visszaellenőrizzük `searchByIpi`-vel: a visszakapott
mű-katalógusnak fednie kell az ismert címeket. Ha nem fed → rossz IPI, wizardhoz.

## Implementációs teendők (`iswc_client.py`)

- [ ] `search_by_title_and_contributor(titles, last_name)` — objektum-lista payload, `type="OT"` default.
- [ ] `discover_ipi(titles, last_name)` — fenti normalizálás + szavazás, konfidenciával.
- [ ] vezetéknév-normalizáló (kötőjel→szóköz, diakritika le, upper) — a megosztott normalizáló modulból.
- [ ] `searchByIpi` cross-check a megszavazott IPI-re.
- [ ] rate-limit / retry / cache `data/artists/{slug}/cisac/` alá.
