"""Column subsets and table names for MLC TSV → Parquet → DuckDB ETL."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SourceSpec:
    id: str
    label: str
    env_var: str
    default_filename: str
    parquet_name: str
    table_name: str
    min_columns: int
    # BWARM header names (subset we keep for search + display)
    columns: tuple[str, ...]


MLC_UNMATCHED = SourceSpec(
    id="unmatched",
    label="MLC unmatched resources",
    env_var="MLC_UNMATCHED_TSV",
    default_filename="unmatchedresources.tsv",
    parquet_name="mlc_unmatched.parquet",
    table_name="mlc_unmatched",
    min_columns=20,
    columns=(
        "UnmatchedResourceRecordId",
        "ResourceType",
        "ISRC",
        "DspResourceId",
        "ResourceTitle",
        "DisplayArtistName",
        "Duration",
        "ReleaseRecordId",
        "OriginalDataProviderName",
    ),
)

MLC_UNCLAIMED = SourceSpec(
    id="unclaimed",
    label="MLC unclaimed work shares",
    env_var="MLC_UNCLAIMED_TSV",
    default_filename="unclaimedmusicalworkrightshares.tsv",
    parquet_name="mlc_unclaimed.parquet",
    table_name="mlc_unclaimed",
    min_columns=13,
    columns=(
        "UnclaimedMusicalWorkRightShareRecordId",
        "MusicalWorkRecordId",
        "ISRC",
        "DspResourceId",
        "ResourceTitle",
        "DisplayArtistName",
        "Duration",
        "UnclaimedRightSharePercentage",
    ),
)

SOURCES: dict[str, SourceSpec] = {
    MLC_UNMATCHED.id: MLC_UNMATCHED,
    MLC_UNCLAIMED.id: MLC_UNCLAIMED,
}

# BWARM v2 headers: first column name includes a leading # in the TSV file.
TSV_COLUMN_ALIASES: dict[str, str] = {
    "UnclaimedMusicalWorkRightShareRecordId": "#UnclaimedMusicalWorkRightShareRecordId",
    "UnmatchedResourceRecordId": "#UnmatchedResourceRecordId",
}


def column_select_list(spec: SourceSpec) -> str:
    parts: list[str] = []
    for col in spec.columns:
        src = TSV_COLUMN_ALIASES.get(col, col)
        if src != col:
            parts.append(f'"{src}" AS "{col}"')
        else:
            parts.append(f'"{col}"')
    return ", ".join(parts)
