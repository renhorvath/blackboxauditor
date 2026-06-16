# Recovery playbook kutatási sablon

Egy szervezet / találattípus recovery folyamatának dokumentálása. Output: `data/recovery-playbooks/{id}.json`.

## Meta

| Mező | Példa |
|------|-------|
| `id` | `hu.artisjus.unidentified_work` |
| `organization` | ARTISJUS |
| `country` | HU |
| `rightsType` | musical_work \| mechanical \| neighbouring |
| `confidence` | verified \| draft \| unknown |
| `version` | 2026-06 |

## Tartalom

1. **summary** — 1–2 mondat: mit jelent a találat
2. **eligibility** — ki claimelhet (szerző, előadó, publisher, örökös)
3. **steps** — számozott lépések (`id`, `order`, `title`, `description`)
4. **requiredData** — ISRC, műcím, IPI, szerződés stb.
5. **requiredPermissions** — tagság, meghatalmazás
6. **documents** — split sheet, szerzői szerződés
7. **channels** — portal URL, email, űrlap
8. **timelines** / **fees** / **pitfalls**
9. **sources** — hivatalos URL + `checkedAt`

## Kutatási prioritás

1. ARTISJUS, MLC (unmatched + unclaimed), GVL (4 típus), SENA (2 role)
2. AKM, AUME, EJI
3. Többi CMO — lásd `docs/research/cmo-country-integration.md`

## App integráció

- Mapper: [`lib/recovery-mapper.ts`](../lib/recovery-mapper.ts)
- Publish snapshot beágyazza a playbook másolatát
- `confidence: unknown` → UI fallback a meglévő `action` szövegre
