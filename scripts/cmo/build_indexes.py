#!/usr/bin/env python3
"""Build searchable JSON indexes from European CMO bulk sources."""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

CMO_DIR = Path(__file__).resolve().parent
if str(CMO_DIR) not in sys.path:
    sys.path.insert(0, str(CMO_DIR))

from gvl_loaders import load_gvl  # noqa: E402
from loaders import load_akm_aume, load_dir_csv, load_dir_xlsx, load_sena  # noqa: E402
from source_specs import BULK_SPECS, gvl_data_present, resolve_files  # noqa: E402

PROJECT_ROOT = CMO_DIR.parents[1]
OUT_PATH = PROJECT_ROOT / "data" / "cmo-index.json"
GVL_OUT_PATH = PROJECT_ROOT / "data" / "cmo-gvl-index.json"
RAW = PROJECT_ROOT / "raw" / "cmo"

LOADERS: dict[str, tuple] = {
    "at-akm": ("AKM", "AT", "musical_work", lambda: load_akm_aume(
        RAW / "at-akm" / "Anfrageliste-AKM-allgemein.xlsx", "at-akm", "AKM", "musical_work"
    )),
    "at-aume": ("Austro-Mechana", "AT", "mechanical", lambda: load_akm_aume(
        RAW / "at-aume" / "Anfrageliste-aume-allgemein.xlsx", "at-aume", "Austro-Mechana", "mechanical"
    )),
    "nl-sena": ("SENA", "NL", "neighbouring", lambda: load_sena(RAW / "nl-sena")),
    "se-stim": ("STIM", "SE", "musical_work", lambda: load_dir_xlsx(
        RAW / "se-stim", source="se-stim", org="STIM", country="SE", rights_type="musical_work"
    )),
    "sk-soza": ("SOZA", "SK", "musical_work", lambda: load_dir_xlsx(
        RAW / "sk-soza", source="sk-soza", org="SOZA", country="SK", rights_type="musical_work"
    )),
    "ro-credidam": ("CREDIDAM", "RO", "neighbouring", lambda: load_dir_xlsx(
        RAW / "ro-credidam", source="ro-credidam", org="CREDIDAM", country="RO", rights_type="neighbouring"
    )),
    "hr-hds-zamp": ("HDS-ZAMP", "HR", "musical_work", lambda: load_dir_xlsx(
        RAW / "hr-hds-zamp", source="hr-hds-zamp", org="HDS-ZAMP", country="HR", rights_type="musical_work"
    )),
    "ro-ucmr-ada": ("UCMR-ADA", "RO", "musical_work", lambda: load_dir_csv(
        RAW / "ro-ucmr-ada", source="ro-ucmr-ada", org="UCMR-ADA", country="RO", rights_type="musical_work"
    )),
    "ee-eau": ("EAÜ", "EE", "musical_work", lambda: load_dir_csv(
        RAW / "ee-eau", source="ee-eau", org="EAÜ", country="EE", rights_type="musical_work"
    )),
    "ee-eel": ("EEL", "EE", "neighbouring", lambda: load_dir_xlsx(
        RAW / "ee-eel", source="ee-eel", org="EEL", country="EE", rights_type="neighbouring"
    )),
    "cz-intergram": ("INTERGRAM", "CZ", "neighbouring", lambda: load_dir_xlsx(
        RAW / "cz-intergram", source="cz-intergram", org="INTERGRAM", country="CZ", rights_type="neighbouring"
    )),
    "fi-gramex": ("Gramex", "FI", "neighbouring", lambda: load_dir_xlsx(
        RAW / "fi-gramex", source="fi-gramex", org="Gramex", country="FI", rights_type="neighbouring"
    )),
    "de-gvl": ("GVL", "DE", "neighbouring", lambda: load_gvl(
        RAW / "de-gvl",
        derived_dir=PROJECT_ROOT / "derived" / "cmo" / "de-gvl",
        force_sendemeldungen_csv="--gvl-force-pdf" in sys.argv,
    )),
}


def main() -> None:
    if "--bootstrap" in sys.argv:
        from bootstrap_fixtures import bootstrap

        bootstrap()

    sources: dict = {}
    gvl_source: dict | None = None
    skipped: list[str] = []

    for spec in BULK_SPECS:
        if spec.id == "de-gvl":
            if not gvl_data_present(RAW):
                skipped.append(f"{spec.id} (optional, no data in de-gvl/)")
                continue
        files = resolve_files(RAW, spec)
        if not files and spec.id not in ("at-akm", "at-aume", "nl-sena", "de-gvl"):
            if spec.optional:
                skipped.append(f"{spec.id} (optional, no files)")
            else:
                skipped.append(f"{spec.id} (no files in {spec.dir_name}/)")
            continue
        try:
            loader = LOADERS[spec.id][3]
            loaded = loader()
            if spec.id == "de-gvl":
                gvl_source = loaded
            else:
                sources[spec.id] = loaded
        except FileNotFoundError:
            skipped.append(f"{spec.id} (directory missing)")
        except Exception as err:
            print(f"WARNING: failed to load {spec.id}: {err}", file=sys.stderr)
            skipped.append(f"{spec.id} (error)")

    built_at = datetime.now(timezone.utc).isoformat()
    payload = {
        "version": 2,
        "builtAt": built_at,
        "sources": sources,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(payload), encoding="utf-8")
    total = sum(s["recordCount"] for s in sources.values())
    gvl_count = gvl_source["recordCount"] if gvl_source else 0
    print(f"Wrote {OUT_PATH} ({total:,} records across {len(sources)} sources)")
    for sid, meta in sources.items():
        print(f"  {sid}: {meta['recordCount']:,} ({meta['organization']})")

    if gvl_source:
        gvl_payload = {
            "version": 2,
            "builtAt": built_at,
            "sources": {"de-gvl": gvl_source},
        }
        GVL_OUT_PATH.write_text(json.dumps(gvl_payload), encoding="utf-8")
        print(f"Wrote {GVL_OUT_PATH} ({gvl_count:,} records — de-gvl)")
        total += gvl_count

    if skipped:
        print("Skipped:", ", ".join(skipped))
    print(f"Total indexed: {total:,} records")


if __name__ == "__main__":
    main()
