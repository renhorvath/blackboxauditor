#!/usr/bin/env python3
"""EJI bbox tracks — resolution vs Spotify catalog + optional adatlap export."""

from __future__ import annotations

import csv
import html
import json
import re
import shutil
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TEMPLATE = Path("/Users/ren/Downloads/hangfelveteli_adatlap_excel_sablon.xls")
OUT_CSV = DATA / "snyl_eji_tracks.csv"
OUT_CANONICAL = DATA / "snyl_eji_tracks_canonical.csv"
OUT_READY = DATA / "snyl_eji_ready_to_submit.csv"
OUT_PARTIAL = DATA / "snyl_eji_needs_info.csv"
OUT_SUMMARY = DATA / "snyl_eji_summary.json"
OUT_XLS = DATA / "snyl_eji_adatlap_filled.xls"
OUT_XLS_READY = DATA / "snyl_eji_adatlap_ready.xls"

# EJI közreműködés — SNYL előadó/producer; finomítás kézzel remix/stúdió esetén
DEFAULT_CONTRIBUTION = "Hangtermes zenész"
DEFAULT_SOLOIST = "I"
DEFAULT_BAND = "N"

EJI_RE = re.compile(r"eji-track-(\d+)", re.I)
PSEUDO = re.compile(r"^eji:track:", re.I)


def norm_title(value: str) -> str:
    s = clean_bbox_title(value).upper()
    s = re.sub(r"\[[^\]]*\]", " ", s)
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^A-Z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def norm_isrc(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def clean_bbox_title(t: str) -> str:
    t = html.unescape(t or "")
    t = re.sub(r'^"+|"+$', "", t)
    t = re.sub(r'"{2,}', '"', t)
    t = re.sub(r'\\""', '"', t)
    return t.strip(' "')


def load_catalog() -> tuple[dict[str, dict], dict[str, list[dict]]]:
    by_isrc: dict[str, dict] = {}
    by_title: dict[str, list[dict]] = defaultdict(list)
    paths = [DATA / "snyl_catalog_snyl_only.csv", DATA / "snyl_catalog_scrape.csv"]
    for path in paths:
        if not path.exists():
            continue
        prefer = path.name == "snyl_catalog_snyl_only.csv"
        with path.open(newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                isrc = norm_isrc(r.get("isrc", ""))
                if isrc and (prefer or isrc not in by_isrc):
                    by_isrc[isrc] = r
                by_title[norm_title(r.get("title", ""))].append(r)
    return by_isrc, by_title


def match_catalog(
    bbox_title: str,
    bbox_isrc: str,
    by_isrc: dict[str, dict],
    by_title: dict[str, list[dict]],
) -> tuple[dict | None, str]:
    isrc = norm_isrc(bbox_isrc) if not PSEUDO.match(bbox_isrc) else ""
    if isrc and isrc in by_isrc:
        return by_isrc[isrc], "isrc"
    t = norm_title(clean_bbox_title(bbox_title))
    if t in by_title:
        return by_title[t][0], "title_exact"
    # strip remix suffix for parent match
    parent = re.sub(r"\s+(SNYL )?REMIX.*$", "", t, flags=re.I)
    parent = re.sub(r"\s+ORIGINAL MIX$", "", parent)
    parent = re.sub(r"\s+RADIO EDIT$", "", parent)
    if parent in by_title:
        return by_title[parent][0], "title_parent"
    # token overlap (FASCINATION … ↔ Fascination - OIBAF&WALLEN Remix)
    t_tokens = set(t.split())
    best: tuple[int, dict] | None = None
    if len(t_tokens) >= 2:
        for tk, rows in by_title.items():
            overlap = len(t_tokens & set(tk.split()))
            if overlap >= 2 and overlap >= len(t_tokens) * 0.5:
                if not best or overlap > best[0]:
                    best = (overlap, rows[0])
    if best:
        return best[1], "title_token"
    if len(t.split()) == 1:
        word = t
        for tk, rows in by_title.items():
            if tk == word or tk.startswith(word + " "):
                return rows[0], "title_single_word"
    for tk, rows in by_title.items():
        if len(t) >= 8 and (t in tk or tk in t):
            return rows[0], "title_fuzzy"
    return None, ""


def main_artist(artist: str, cat: dict | None) -> str:
    if cat and cat.get("artists"):
        parts = [p.strip() for p in cat["artists"].split(";") if p.strip()]
        if parts:
            return parts[0] if "SNYL" not in parts[0].upper() else "SNYL"
    a = (artist or "").strip()
    return a.split(",")[0].strip() if a else "SNYL"


def track_title_for_eji(bbox_title: str, cat: dict | None) -> str:
    if cat and cat.get("title"):
        return cat["title"]
    return clean_bbox_title(bbox_title)


def resolution_status(isrc: str, year: str, label: str) -> str:
    if isrc and year and label:
        return "ready"
    missing = []
    if not isrc:
        missing.append("isrc")
    if not year:
        missing.append("year")
    if not label:
        missing.append("label")
    return "partial" if missing else "blocked"


def missing_fields(isrc: str, year: str, label: str) -> str:
    out = []
    if not isrc:
        out.append("isrc")
    if not year:
        out.append("release_year")
    if not label:
        out.append("label")
    return ";".join(out)


def bbox_problem_type(is_pseudo: bool, bbox_isrc: str, match_how: str, cat: dict | None) -> str:
    if is_pseudo and not cat:
        return "eji_pszeudo_id_nincs_isrc"
    if is_pseudo and cat:
        return "eji_pszeudo_id_katalogus_match"
    if match_how == "isrc" and norm_isrc(bbox_isrc) == norm_isrc(cat.get("isrc", "") if cat else ""):
        return "isrc_azonos_katalogussal"
    if match_how and match_how != "isrc":
        return "bbox_cim_eltér_katalogus_egyezett"
    return "isrc_bboxon_nem_egyezik_katalogussal"


def megoldas_text(status: str, problem: str, is_dup: bool, group_size: int, missing: str) -> str:
    if status == "ready":
        if is_dup and group_size > 1:
            return (
                f"Feloldható — bbox duplikátum ({group_size} sor ugyanahhoz az EJI trackhez); "
                "egy adatlappal lefedhető"
            )
        if problem.startswith("eji_pszeudo"):
            return "Feloldható — EJI pszeudo sor; ISRC + kiadó + év katalogusból pótolva, adatlap leadás"
        return "Feloldható — ISRC + kiadó + év megvan, EJI hangfelvételi adatlap leadás"
    if status == "partial":
        return f"Nem feloldható automatikusan — hiányzik: {missing.replace(';', ', ')}; Feri/manuális keresés"
    return "Blokkolt — nincs elegendő adat a leadáshoz"


def allapot_hu(status: str) -> str:
    return {"ready": "kesz", "partial": "hianyos", "blocked": "blokkolt"}.get(status, status)


def build_resolved_row(
    r: dict,
    cat: dict | None,
    match_how: str,
    by_isrc: dict[str, dict],
    by_title: dict[str, list[dict]],
) -> dict:
    is_pseudo = r["is_pseudo"]
    isrc = norm_isrc(r["bbox_isrc"]) if not is_pseudo else norm_isrc(cat.get("isrc", "") if cat else "")
    year = (cat.get("release_date", "") or "")[:4] if cat else ""
    label = (cat.get("label", "") or "") if cat else ""
    status = resolution_status(isrc, year, label)
    problem = bbox_problem_type(is_pseudo, r["bbox_isrc"], match_how, cat)

    return {
        "bbox_isrc": r["bbox_isrc"],
        "bbox_title": r["bbox_title"],
        "bbox_artist": r["bbox_artist"],
        "is_pseudo_bbox_row": "igen" if is_pseudo else "nem",
        "bbox_hiba_tipus": problem,
        "catalog_match": match_how or "none",
        "isrc": isrc,
        "release_year": year,
        "label": label,
        "release_date": cat.get("release_date", "") if cat else "",
        "release_name": cat.get("release_name", "") if cat else "",
        "catalog_title": cat.get("title", "") if cat else "",
        "catalog_artists": cat.get("artists", "") if cat else "",
        "upc": cat.get("upc", "") if cat else "",
        "spotify_url": cat.get("spotify_url", "") if cat else "",
        "beatport_url": cat.get("beatport_url", "") if cat else "",
        "resolution_status": status,
        "allapot": allapot_hu(status),
        "missing_fields": missing_fields(isrc, year, label),
        "feloldhato": "igen" if status == "ready" else "nem",
        "can_clear_from_eji_list": "igen" if status == "ready" else "nem",
        "playbooks": r["playbooks"],
        "sources": r["sources"],
        "eji_track_title": track_title_for_eji(r["bbox_title"], cat),
        "eji_album_title": (cat.get("release_name", "") if cat else ""),
        "eji_main_artist": main_artist(r["bbox_artist"], cat),
        "eji_soloist": DEFAULT_SOLOIST,
        "eji_band_member": DEFAULT_BAND,
        "eji_band_members_count": "",
        "eji_contribution": DEFAULT_CONTRIBUTION,
        "eji_record_label": label,
        "eji_release_year": year,
        "eji_isrc": isrc,
        "eji_notes": "",
        "_match_how": match_how,
        "_is_pseudo": is_pseudo,
        "_problem": problem,
        "_status": status,
    }


def enrich_bbox_rows(
    raw: list[dict],
    by_isrc: dict[str, dict],
    by_title: dict[str, list[dict]],
) -> list[dict]:
    """All 131 bbox EJI rows with resolution + duplicate grouping."""
    # Per-row resolution
    resolved: list[dict] = []
    for i, r in enumerate(raw, start=1):
        cat, match_how = match_catalog(r["bbox_title"], r["bbox_isrc"], by_isrc, by_title)
        row = build_resolved_row(r, cat, match_how, by_isrc, by_title)
        eji_id = r["eji_track_ids"][0] if r["eji_track_ids"] else ""
        row.update(
            {
                "bbox_sor": i,
                "eji_track_id": eji_id,
                "eji_fent": "igen",
                "hibas_bbox_sor": "igen",
                "eji_playbook": "hu.eji.unidentified" if "eji" in r["playbooks"].lower() else "",
                "tobb_playbook": "igen" if r["playbooks"] != "hu.eji.unidentified" else "nem",
            }
        )
        resolved.append(row)

    # Group stats per EJI track id
    by_eji: dict[str, list[int]] = defaultdict(list)
    for idx, row in enumerate(resolved):
        by_eji[row["eji_track_id"]].append(idx)

    # Canonical key per row (for dedup view)
    for idx, row in enumerate(resolved):
        eji_id = row["eji_track_id"]
        group = by_eji[eji_id]
        row["bbox_csoport_meret"] = len(group)
        row["canonical_key"] = row["isrc"] or f"eji:{eji_id}"

        # Primary = best row in EJI group: ready + real isrc, else first ready, else first
        def row_score(ri: int) -> tuple:
            rr = resolved[ri]
            has_real = 0 if rr["is_pseudo_bbox_row"] == "igen" else 1
            ready = 1 if rr["resolution_status"] == "ready" else 0
            return (ready, has_real, -ri)

        primary_idx = max(group, key=row_score)
        row["primary_bbox_sor"] = resolved[primary_idx]["bbox_sor"]
        row["duplikatum"] = "nem" if idx == primary_idx else "igen"
        row["megoldas"] = megoldas_text(
            row["resolution_status"],
            row["bbox_hiba_tipus"],
            row["duplikatum"] == "igen",
            row["bbox_csoport_meret"],
            row["missing_fields"],
        )
        if not row["isrc"] and row["is_pseudo_bbox_row"] == "igen":
            row["eji_notes"] = "EJI pszeudo sor — nincs ISRC a bboxban, katalógus match kell"
        elif row["resolution_status"] == "partial":
            row["eji_notes"] = f"Hiányzik: {row['missing_fields']}"

    return resolved


def load_bbox_eji() -> list[dict]:
    rows: list[dict] = []
    path = DATA / "snyl_bbox_report_findings.csv"
    with path.open(newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            pb = r.get("playbooks", "")
            src = r.get("sources", "")
            if "eji" not in pb.lower() and "eji" not in src.lower():
                continue
            eji_ids = EJI_RE.findall(src)
            rows.append(
                {
                    "bbox_isrc": r.get("isrc", ""),
                    "bbox_title": clean_bbox_title(r.get("title", "")),
                    "bbox_artist": r.get("artist", ""),
                    "playbooks": pb,
                    "sources": src,
                    "eji_track_ids": eji_ids,
                    "is_pseudo": bool(PSEUDO.match(r.get("isrc", ""))),
                }
            )
    return rows


BBOX_CSV_FIELDS = [
    "bbox_sor",
    "eji_track_id",
    "hibas_bbox_sor",
    "eji_fent",
    "bbox_isrc",
    "bbox_title",
    "bbox_artist",
    "bbox_hiba_tipus",
    "is_pseudo_bbox_row",
    "duplikatum",
    "bbox_csoport_meret",
    "primary_bbox_sor",
    "canonical_key",
    "feloldhato",
    "allapot",
    "resolution_status",
    "megoldas",
    "missing_fields",
    "can_clear_from_eji_list",
    "catalog_match",
    "isrc",
    "release_year",
    "label",
    "release_date",
    "release_name",
    "catalog_title",
    "catalog_artists",
    "upc",
    "spotify_url",
    "beatport_url",
    "tobb_playbook",
    "playbooks",
    "sources",
    "eji_track_title",
    "eji_album_title",
    "eji_main_artist",
    "eji_soloist",
    "eji_band_member",
    "eji_band_members_count",
    "eji_contribution",
    "eji_record_label",
    "eji_release_year",
    "eji_isrc",
    "eji_notes",
]

CANONICAL_EXTRA = ["eji_track_ids", "bbox_rows_count", "bbox_primary_sor"]


def canonical_from_bbox(bbox_rows: list[dict]) -> list[dict]:
    """Build deduped canonical list from enriched bbox rows (primary rows only)."""
    primaries = [r for r in bbox_rows if r.get("duplikatum") == "nem"]
    by_key: dict[str, dict] = {}
    for row in primaries:
        key = row["canonical_key"]
        existing = by_key.get(key)
        if not existing or (
            row["resolution_status"] == "ready" and existing["resolution_status"] != "ready"
        ):
            by_key[key] = row

    out: list[dict] = []
    for row in sorted(by_key.values(), key=lambda x: (x["allapot"], x["eji_track_title"])):
        canon = {k: row[k] for k in BBOX_CSV_FIELDS if k in row}
        canon["eji_track_ids"] = row["eji_track_id"]
        canon["bbox_rows_count"] = str(row["bbox_csoport_meret"])
        canon["bbox_primary_sor"] = str(row["bbox_sor"])
        out.append(canon)
    return out


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def try_fill_template(rows: list[dict], template: Path, out_path: Path) -> str:
    """Fill EJI xls template; fall back to xlwt export if encrypted."""
    import xlrd
    import xlwt
    from xlutils.copy import copy as xl_copy

    ready = [r for r in rows if r["can_clear_from_eji_list"] == "igen"]

    # EJI sablon tipikus oszlopok (adat sorok — fejléc a sablonban van)
    DATA_COLS = [
        ("eji_track_title", "Hangfelvétel címe"),
        ("eji_album_title", "Album címe"),
        ("eji_main_artist", "Előadó/zenekar"),
        ("eji_soloist", "Szólista"),
        ("eji_band_member", "Zenekari tag"),
        ("eji_band_members_count", "Tagok száma"),
        ("eji_contribution", "Közreműködés"),
        ("eji_record_label", "Kiadó"),
        ("eji_release_year", "Megjelenés éve"),
        ("eji_isrc", "ISRC"),
    ]

    try:
        book = xlrd.open_workbook(str(template), formatting_info=True)
        wbook = xl_copy(book)
        sheet = wbook.get_sheet(0)
        # Find first empty data row (skip header rows)
        sh = book.sheet_by_index(0)
        start_row = 1
        for r in range(sh.nrows):
            val = str(sh.cell_value(r, 0)).strip()
            if val.lower() in ("hangfelvétel címe", "a hangfelvétel címe", "cím", "title"):
                start_row = r + 1
                break
        for i, row in enumerate(ready):
            rr = start_row + i
            for c, (key, _label) in enumerate(DATA_COLS):
                sheet.write(rr, c, row.get(key, ""))
        wbook.save(str(out_path))
        return f"filled_template:{out_path}"
    except Exception as exc:
        # Encrypted or unreadable — write xlwt workbook with header row
        wb = xlwt.Workbook()
        ws = wb.add_sheet("Hangfelvetelek")
        for c, (_key, label) in enumerate(DATA_COLS):
            ws.write(0, c, label)
        for i, row in enumerate(ready, start=1):
            for c, (key, _label) in enumerate(DATA_COLS):
                ws.write(i, c, row.get(key, ""))
        wb.save(str(out_path))
        return f"xlwt_fallback ({exc.__class__.__name__}): {out_path}"


def main() -> None:
    by_isrc, by_title = load_catalog()
    raw = load_bbox_eji()
    bbox_rows = enrich_bbox_rows(raw, by_isrc, by_title)
    canonical = canonical_from_bbox(bbox_rows)

    write_csv(OUT_CSV, bbox_rows, BBOX_CSV_FIELDS)
    write_csv(OUT_CANONICAL, canonical, BBOX_CSV_FIELDS + CANONICAL_EXTRA)
    write_csv(
        OUT_READY,
        [r for r in canonical if r["can_clear_from_eji_list"] == "igen"],
        BBOX_CSV_FIELDS + CANONICAL_EXTRA,
    )
    write_csv(
        OUT_PARTIAL,
        [r for r in canonical if r["can_clear_from_eji_list"] != "igen"],
        BBOX_CSV_FIELDS + CANONICAL_EXTRA,
    )

    summary = {
        "bbox_eji_rows_raw": len(raw),
        "bbox_rows_in_csv": len(bbox_rows),
        "deduped_tracks": len(canonical),
        "bbox_rows_feloldhato": sum(1 for r in bbox_rows if r["feloldhato"] == "igen"),
        "bbox_rows_duplikatum": sum(1 for r in bbox_rows if r["duplikatum"] == "igen"),
        "ready_to_clear": sum(1 for r in canonical if r["resolution_status"] == "ready"),
        "partial": sum(1 for r in canonical if r["resolution_status"] == "partial"),
        "blocked": sum(1 for r in canonical if r["resolution_status"] == "blocked"),
        "pseudo_bbox_only": sum(
            1 for r in canonical if r["is_pseudo_bbox_row"] == "igen" and not r["isrc"]
        ),
        "with_isrc": sum(1 for r in canonical if r["isrc"]),
        "with_label": sum(1 for r in canonical if r["label"]),
    }
    OUT_SUMMARY.write_text(json.dumps(summary, indent=2, ensure_ascii=False))

    xls_note = ""
    if TEMPLATE.exists():
        shutil.copy2(TEMPLATE, DATA / "hangfelveteli_adatlap_excel_sablon_source.xls")
        try:
            import xlwt  # noqa: F401
            from xlutils.copy import copy as _xl_copy  # noqa: F401

            xls_note = try_fill_template(canonical, TEMPLATE, OUT_XLS)
            try_fill_template(
                [r for r in canonical if r["can_clear_from_eji_list"] == "igen"],
                TEMPLATE,
                OUT_XLS_READY,
            )
            filled_dl = TEMPLATE.parent / "hangfelveteli_adatlap_SNYL_kitoltve.xls"
            shutil.copy2(OUT_XLS_READY, filled_dl)
            xls_note += f"; copied ready rows -> {filled_dl}"
        except ImportError:
            xls_note = "xlwt/xlutils missing — pip install xlwt xlutils xlrd"
    else:
        xls_note = f"template not found: {TEMPLATE}"

    print(json.dumps(summary, indent=2, ensure_ascii=False))
    print(f"Wrote {OUT_CSV} ({len(bbox_rows)} bbox rows)")
    print(f"Wrote {OUT_CANONICAL} ({len(canonical)} canonical tracks)")
    print(f"Wrote {OUT_READY} ({summary['ready_to_clear']} rows)")
    print(f"Wrote {OUT_PARTIAL} ({summary['partial'] + summary['blocked']} rows)")
    print(f"Wrote {OUT_SUMMARY}")
    print(f"XLS: {xls_note}")
    if summary["partial"] or summary["blocked"]:
        print("\n--- Needs manual info (first 10) ---")
        for r in [x for x in canonical if x["can_clear_from_eji_list"] != "igen"][:10]:
            print(
                f"  {r.get('eji_track_ids','?'):15} | {r['missing_fields']:25} | "
                f"{r['bbox_title'][:55]}"
            )


if __name__ == "__main__":
    main()
