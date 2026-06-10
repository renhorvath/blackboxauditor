#!/usr/bin/env python3
"""Create minimal placeholder spreadsheets when raw CMO files are missing (dev/smoke)."""

from __future__ import annotations

from pathlib import Path

import openpyxl

from source_specs import BULK_SPECS

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW = PROJECT_ROOT / "raw" / "cmo"


def write_xlsx(path: Path, sheet_rows: dict[str, list[tuple]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for sheet_name, rows in sheet_rows.items():
        ws = wb.create_sheet(sheet_name)
        for row in rows:
            ws.append(row)
    wb.save(path)


def bootstrap() -> list[str]:
    created: list[str] = []

    fixtures: dict[str, Path | dict[str, list[tuple]]] = {
        "se-stim": RAW / "se-stim" / "unregistered-works.xlsx",
        "sk-soza": RAW / "sk-soza" / "niezidentifikovane.xlsx",
        "ro-credidam": RAW / "ro-credidam" / "radio.xlsx",
        "hr-hds-zamp-domestic": RAW / "hr-hds-zamp" / "domestic.xlsx",
        "hr-hds-zamp-foreign": RAW / "hr-hds-zamp" / "foreign.xlsx",
        "hr-hds-zamp-other": RAW / "hr-hds-zamp" / "other.xlsx",
        "ee-eau": RAW / "ee-eau" / "unidentified.csv",
        "ee-eel": RAW / "ee-eel" / "unidentified.xlsx",
        "cz-intergram": RAW / "cz-intergram" / "neevidovana.xlsx",
        "fi-gramex": RAW / "fi-gramex" / "radio.xlsx",
        "ro-ucmr-ada": RAW / "ro-ucmr-ada" / "unidentified.csv",
    }

    xlsx_data: dict[str, dict[str, list[tuple]]] = {
        "se-stim": {
            "Sheet1": [
                ("Work title", "Artist", "ISRC", "Period"),
                ("Dancing Queen", "ABBA", "SEUM71600600", "2024-Q4"),
            ],
        },
        "sk-soza": {
            "Sheet1": [
                ("Názov diela", "Autor", "Interpret"),
                ("Test Work", "Test Composer", "Test Artist"),
            ],
        },
        "ro-credidam": {
            "Radio": [
                ("Title", "Performer", "Duration"),
                ("Sample Phono", "Sample Band", "00:03:30"),
            ],
            "TV": [
                ("Title", "Performer", "Duration"),
                ("TV Sample", "TV Artist", "00:02:00"),
            ],
        },
        "hr-hds-zamp-domestic": {
            "Domestic": [
                ("Naslov", "Autor", "Izvođač"),
                ("Test DJelo", "Test Autor", "Test Izvođač"),
            ],
        },
        "hr-hds-zamp-foreign": {
            "Foreign": [
                ("Naslov", "Autor", "Izvođač"),
                ("Foreign Work", "Foreign Author", "Foreign Artist"),
            ],
        },
        "hr-hds-zamp-other": {
            "Other": [
                ("Naslov", "Autor", "Izvođač"),
                ("Other Work", "Other Author", "Other Artist"),
            ],
        },
        "ee-eel": {
            "Sheet1": [
                ("Title", "Main artist", "ISRC"),
                ("Estonian Hit", "EE Artist", "EE-TEST-001"),
            ],
        },
        "cz-intergram": {
            "Sheet1": [
                ("Název", "Interpret"),
                ("Czech Recording", "CZ Artist"),
            ],
        },
        "fi-gramex": {
            "Radio": [
                ("Title", "Performer"),
                ("Finnish Track", "FI Artist"),
            ],
        },
    }

    for spec in BULK_SPECS:
        if spec.id in ("at-akm", "at-aume", "nl-sena"):
            continue
        base = RAW / spec.dir_name
        existing = list(base.glob("*")) if base.is_dir() else []
        if existing:
            continue
        if spec.id == "hr-hds-zamp":
            if base.is_dir() and any(base.glob("*.xlsx")):
                continue
            for key in ("hr-hds-zamp-domestic", "hr-hds-zamp-foreign", "hr-hds-zamp-other"):
                data = xlsx_data.get(key)
                out = fixtures[key]
                if data and isinstance(out, Path):
                    write_xlsx(out, data)
                    created.append(str(out))
            continue
        if spec.id == "ee-eau" or spec.id == "ro-ucmr-ada":
            csv_path = fixtures[spec.id]
            assert isinstance(csv_path, Path)
            csv_path.parent.mkdir(parents=True, exist_ok=True)
            csv_path.write_text(
                "title,author,artist\nSample Work,Sample Author,Sample Artist\n",
                encoding="utf-8",
            )
            created.append(str(csv_path))
            continue
        data = xlsx_data.get(spec.id)
        if not data:
            continue
        out = fixtures[spec.id]
        assert isinstance(out, Path)
        write_xlsx(out, data)
        created.append(str(out))

    return created


if __name__ == "__main__":
    made = bootstrap()
    if made:
        print("Created placeholder files:")
        for p in made:
            print(f"  {p}")
    else:
        print("All CMO raw files present — no fixtures created.")
