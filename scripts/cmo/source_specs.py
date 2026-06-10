"""CMO bulk source definitions — paths under raw/cmo/."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CmoBulkSpec:
    id: str
    organization: str
    country: str
    rights_type: str  # musical_work | mechanical | neighbouring
    dir_name: str
    required_globs: tuple[str, ...]
    optional: bool = False


BULK_SPECS: tuple[CmoBulkSpec, ...] = (
    CmoBulkSpec("at-akm", "AKM", "AT", "musical_work", "at-akm", ("Anfrageliste-AKM*.xlsx",)),
    CmoBulkSpec("at-aume", "Austro-Mechana", "AT", "mechanical", "at-aume", ("Anfrageliste-aume*.xlsx",)),
    CmoBulkSpec(
        "nl-sena",
        "SENA",
        "NL",
        "neighbouring",
        "nl-sena",
        ("ongeclaimd-nederland.xlsx", "ongeclaimd-buitenland.xlsx"),
    ),
    CmoBulkSpec("se-stim", "STIM", "SE", "musical_work", "se-stim", ("*.xlsx",)),
    CmoBulkSpec("sk-soza", "SOZA", "SK", "musical_work", "sk-soza", ("*.xlsx", "*.xls")),
    CmoBulkSpec(
        "ro-credidam",
        "CREDIDAM",
        "RO",
        "neighbouring",
        "ro-credidam",
        ("*.xlsx", "*.xls"),
    ),
    CmoBulkSpec("hr-hds-zamp", "HDS-ZAMP", "HR", "musical_work", "hr-hds-zamp", ("*.xlsx", "*.xls")),
    CmoBulkSpec(
        "ro-ucmr-ada",
        "UCMR-ADA",
        "RO",
        "musical_work",
        "ro-ucmr-ada",
        ("*.csv",),
        optional=True,
    ),
    CmoBulkSpec("ee-eau", "EAÜ", "EE", "musical_work", "ee-eau", ("*.csv",)),
    CmoBulkSpec("ee-eel", "EEL", "EE", "neighbouring", "ee-eel", ("*.xlsx", "*.xls")),
    CmoBulkSpec("cz-intergram", "INTERGRAM", "CZ", "neighbouring", "cz-intergram", ("*.xlsx", "*.xls")),
    CmoBulkSpec("fi-gramex", "Gramex", "FI", "neighbouring", "fi-gramex", ("*.xlsx", "*.xls")),
)


def spec_by_id(source_id: str) -> CmoBulkSpec | None:
    for spec in BULK_SPECS:
        if spec.id == source_id:
            return spec
    return None


def resolve_files(raw_root: Path, spec: CmoBulkSpec) -> list[Path]:
    base = raw_root / spec.dir_name
    if not base.is_dir():
        return []
    found: list[Path] = []
    for pattern in spec.required_globs:
        found.extend(sorted(base.glob(pattern)))
    return found
