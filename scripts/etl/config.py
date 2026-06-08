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
