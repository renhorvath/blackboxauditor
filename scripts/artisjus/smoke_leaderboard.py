#!/usr/bin/env python3
"""
Smoke test: rank ARTISJUS unmatched *independent* rights holders (solo jogosult).

Default filters (B2C / indie songwriter focus):
  - skip rows where zeneműkiadó is filled (publisher-represented)
  - skip corporate jogosult names (KFT, Publishing, Inc, …)
  - skip share-notation strings (e.g. "100.00% RICK MAROTTA")
  - split "A; B" into separate persons

Usage:
  npm run artisjus:smoke-leaderboard
  npm run artisjus:smoke-leaderboard -- --hu-focus --min-works 5 --top 30
  npm run artisjus:smoke-leaderboard -- --skip-kiado-tables
  npm run artisjus:smoke-leaderboard -- --hints

Calibration anchor (Horváth Renátó, ARTISJUS KIF/2026/0001, ~18 402 Ft / year):
  - domestic streaming line (TNSAA, ~126 plays): ~5 Ft
  - TV allocation (AT): thousands of Ft per event
  - foreign film/mechanics (KF/KM): tens–hundreds of Ft per line
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from felo_tip_catalog import (  # noqa: E402
    CATEGORY_FILM,
    CATEGORY_FOREIGN,
    CATEGORY_MUSIC_STREAM,
    CATEGORY_TV,
    classify_felo_tip,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
ENV_LOCAL = PROJECT_ROOT / ".env.local"
DEFAULT_CSV = PROJECT_ROOT / "raw/cmo/hu-artisjus/artisjus_azonositatlan_muvek_2025.csv"
DEFAULT_OUT = PROJECT_ROOT / "exports"

MUKOD_RE = re.compile(r"^400\d{7}$")
SHARE_RE = re.compile(r"\d+\s*(?:\.\d+)?\s*%")
HU_MARKERS = re.compile(
    r"[ÁÉÍÓÖŐÚÜŰ]|"
    r"\bKFT\b|\bZRT\b|\bBT\b|"
    r"BUDAPEST|MAGYAR|HUNGAR|MAGNEOTON|HUNGAROTON|EDITIO MUSICA|ARTISJUS",
    re.IGNORECASE,
)
CORPORATE_RE = re.compile(
    r"\b("
    r"KFT|ZRT|BT|"
    r"INC|LTD|LIMITED|LLC|L\.L\.C\.|GMBH|AG|"
    r"S\.?\s*R\.?\s*O\.?|SPOL|D\s*O\s*O|"
    r"PUBLISH(?:ING|ER)?|MUSIC\s+PUBL|"
    r"RECORDS?|ENTERTAINMENT|PRODUCTIONS?|"
    r"SONGS\s+OF|UNIVERSAL|WARNER|BMG|SONY|"
    r"COMPOSITEUR|AUTEUR|"
    r"VALIOUS\s+ARTISTS|UNKNOWN\s+COMPOSER|UNKNOWN\s+WRITER"
    r")\b",
    re.IGNORECASE,
)

NOISE_EXACT = frozenset(
    {
        "INCONNU COMPOSITEUR AUTEUR",
        "UNKNOWN WRITER",
        "UNKNOWN",
        "UNKNOWN COMPOSER",
        "N/A",
        "NA",
        "TBD",
        "VALIOUS ARTISTS",
    }
)


@dataclass
class EntityStats:
    name: str
    works: set[str] = field(default_factory=set)
    rows: int = 0
    music_stream_rows: int = 0
    film_rows: int = 0
    tv_rows: int = 0
    foreign_rows: int = 0
    film_works: set[str] = field(default_factory=set)
    foreign_works: set[str] = field(default_factory=set)

    @property
    def unique_works(self) -> int:
        return len(self.works)

    @property
    def film_work_count(self) -> int:
        return len(self.film_works)

    @property
    def foreign_work_count(self) -> int:
        return len(self.foreign_works)

    def hint_ft_range(self) -> tuple[int, int]:
        lo = (
            self.music_stream_rows * 2
            + self.film_rows * 1
            + self.foreign_rows * 8
            + self.tv_rows * 200
        )
        hi = (
            self.music_stream_rows * 10
            + self.film_rows * 20
            + self.foreign_rows * 150
            + self.tv_rows * 5000
        )
        return lo, hi


def load_dotenv_local() -> None:
    if not ENV_LOCAL.is_file():
        return
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


def csv_path() -> Path:
    raw = os.environ.get("ARTISJUS_CSV_PATH", "").strip()
    return Path(raw) if raw else DEFAULT_CSV


def normalize_name(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip().upper())


def is_noise(name: str) -> bool:
    if len(name) < 4:
        return True
    if name in NOISE_EXACT:
        return True
    if name.startswith("INCONNU"):
        return True
    return False


def is_corporate(name: str) -> bool:
    return bool(CORPORATE_RE.search(name))


def is_share_notation(name: str) -> bool:
    return bool(SHARE_RE.search(name))


def is_solo_person(name: str) -> bool:
    if is_noise(name) or is_corporate(name) or is_share_notation(name):
        return False
    # Very long blobs are usually compound publisher / society strings.
    if len(name.split()) > 8:
        return False
    return True


def split_jogosult_names(raw: str) -> list[str]:
    parts = re.split(r"\s*;\s*", raw)
    out: list[str] = []
    for part in parts:
        name = normalize_name(part)
        if is_solo_person(name):
            out.append(name)
    return out


def hu_focus_ok(name: str) -> bool:
    return bool(HU_MARKERS.search(name))


def add_row_to_entity(
    entities: dict[str, EntityStats],
    name: str,
    mukod: str,
    felo_raw: str,
) -> None:
    stats = entities.setdefault(name, EntityStats(name))
    stats.works.add(mukod)
    stats.rows += 1
    category = classify_felo_tip(felo_raw)
    if category == CATEGORY_MUSIC_STREAM:
        stats.music_stream_rows += 1
    elif category == CATEGORY_FILM:
        stats.film_rows += 1
        stats.film_works.add(mukod)
    elif category == CATEGORY_TV:
        stats.tv_rows += 1
    elif category == CATEGORY_FOREIGN:
        stats.foreign_rows += 1
        stats.foreign_works.add(mukod)


def scan_csv(
    path: Path,
    *,
    hu_focus: bool,
    include_with_kiado: bool,
    build_kiado_tables: bool,
) -> tuple[
    dict[str, EntityStats],
    dict[str, EntityStats],
    dict[str, EntityStats],
    dict[str, int],
]:
    by_solo_jog: dict[str, EntityStats] = {}
    by_kiado: dict[str, EntityStats] = {}
    by_kiados_jog: dict[str, EntityStats] = {}
    skipped = {
        "rows_total": 0,
        "rows_with_zenemu_kiado": 0,
        "skipped_kiado_on_solo": 0,
        "skipped_noise_jogosult": 0,
        "skipped_corporate_jogosult": 0,
        "skipped_share_jogosult": 0,
        "accepted_solo_person_rows": 0,
        "accepted_kiados_jog_rows": 0,
    }

    def accept_persons(
        target: dict[str, EntityStats],
        jog_raw: str,
        mukod: str,
        felo_raw: str,
        counter_key: str,
    ) -> None:
        if is_noise(jog_raw):
            skipped["skipped_noise_jogosult"] += 1
            return
        if is_corporate(jog_raw):
            skipped["skipped_corporate_jogosult"] += 1
            return
        if is_share_notation(jog_raw):
            skipped["skipped_share_jogosult"] += 1
            return

        persons = split_jogosult_names(jog_raw)
        if not persons:
            skipped["skipped_noise_jogosult"] += 1
            return

        for person in persons:
            if hu_focus and not hu_focus_ok(person):
                continue
            add_row_to_entity(target, person, mukod, felo_raw)
            skipped[counter_key] += 1

    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            skipped["rows_total"] += 1
            mukod = (row.get("mukod") or "").strip()
            if not MUKOD_RE.match(mukod):
                continue

            felo_raw = (row.get("felo_tip") or "").strip()
            jog_raw = normalize_name(row.get("jogosultak"))
            kiado_name = normalize_name(row.get("zenemu_kiado"))
            has_kiado = bool(kiado_name)

            if has_kiado:
                skipped["rows_with_zenemu_kiado"] += 1
                if build_kiado_tables and not is_noise(kiado_name):
                    if not hu_focus or hu_focus_ok(kiado_name):
                        add_row_to_entity(by_kiado, kiado_name, mukod, felo_raw)
                if jog_raw:
                    accept_persons(
                        by_kiados_jog,
                        jog_raw,
                        mukod,
                        felo_raw,
                        "accepted_kiados_jog_rows",
                    )

            if not jog_raw:
                continue

            if not include_with_kiado and has_kiado:
                skipped["skipped_kiado_on_solo"] += 1
                continue

            accept_persons(
                by_solo_jog,
                jog_raw,
                mukod,
                felo_raw,
                "accepted_solo_person_rows",
            )

    return by_solo_jog, by_kiado, by_kiados_jog, skipped


def rank_entities(entities: dict[str, EntityStats], *, min_works: int) -> list[EntityStats]:
    out = [e for e in entities.values() if e.unique_works >= min_works]
    out.sort(
        key=lambda e: (
            e.unique_works,
            e.rows,
            e.music_stream_rows + e.tv_rows,
            e.film_rows,
        ),
        reverse=True,
    )
    return out


def print_table(title: str, rows: list[EntityStats], *, top: int, hints: bool) -> None:
    print(f"\n{'=' * 80}")
    print(title)
    print(f"{'=' * 80}")
    if not rows:
        print("(nincs találat a szűrőkkel)")
        return

    # strm=zenei streaming (TNS/NS), film=SEF/SVF/KF/…, tv=AT/RAT* zene, kulf=KA/KM
    header = (
        f"{'#':>3}  {'mű':>5}  {'sor':>6}  {'strm':>5}  {'film':>5}  {'tv':>4}  {'kulf':>4}  "
    )
    if hints:
        print(header + f"{'hint Ft':>14}  név")
    else:
        print(header + "név")

    for i, e in enumerate(rows[:top], start=1):
        if hints:
            lo, hi = e.hint_ft_range()
            hint = f"{lo:,}–{hi:,}".replace(",", " ")
            print(
                f"{i:3}  {e.unique_works:5}  {e.rows:6}  {e.music_stream_rows:5}  "
                f"{e.film_rows:5}  {e.tv_rows:4}  {e.foreign_work_count:4}  {hint:>14}  "
                f"{e.name[:48]}"
            )
        else:
            print(
                f"{i:3}  {e.unique_works:5}  {e.rows:6}  {e.music_stream_rows:5}  "
                f"{e.film_rows:5}  {e.tv_rows:4}  {e.foreign_work_count:4}  {e.name[:62]}"
            )


def write_csv(
    path: Path,
    rows: list[EntityStats],
    *,
    entity_type: str,
    hints: bool,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "rank",
        "entity_type",
        "name",
        "unique_works",
        "allocation_rows",
        "music_stream_rows",
        "film_rows",
        "tv_rows",
        "foreign_rows",
        "film_works",
        "foreign_works",
    ]
    if hints:
        fieldnames += ["hint_ft_low", "hint_ft_high"]

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for i, e in enumerate(rows, start=1):
            out = {
                "rank": i,
                "entity_type": entity_type,
                "name": e.name,
                "unique_works": e.unique_works,
                "allocation_rows": e.rows,
                "music_stream_rows": e.music_stream_rows,
                "film_rows": e.film_rows,
                "tv_rows": e.tv_rows,
                "foreign_rows": e.foreign_rows,
                "film_works": e.film_work_count,
                "foreign_works": e.foreign_work_count,
            }
            if hints:
                lo, hi = e.hint_ft_range()
                out["hint_ft_low"] = lo
                out["hint_ft_high"] = hi
            w.writerow(out)


def main() -> int:
    load_dotenv_local()

    parser = argparse.ArgumentParser(
        description="ARTISJUS smoke leaderboard — indie jogosultak (zeneműkiadó nélkül)"
    )
    parser.add_argument("--csv", type=Path, default=None, help="Override ARTISJUS CSV path")
    parser.add_argument("--min-works", type=int, default=10, help="Min unique műkód per person")
    parser.add_argument("--top", type=int, default=40, help="Rows to print")
    parser.add_argument(
        "--hu-focus",
        action="store_true",
        help="Only names with HU markers (accent, Budapest, etc.)",
    )
    parser.add_argument("--hints", action="store_true", help="Show rough Ft/year bands")
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    parser.add_argument(
        "--include-with-kiado",
        action="store_true",
        help="Also count rows where zeneműkiadó is filled (default: skip them)",
    )
    parser.add_argument(
        "--skip-kiado-tables",
        action="store_true",
        help="Do not build zeneműkiadó / kiadós-jogosult tables",
    )
    args = parser.parse_args()

    path = args.csv or csv_path()
    if not path.is_file():
        print(f"Missing CSV: {path}", file=sys.stderr)
        return 1

    print(f"Reading {path} …")
    print(
        "Filter: solo jogosult only — no zeneműkiadó on row, no corporate/share names"
        + (" [HU focus]" if args.hu_focus else "")
    )
    by_solo, by_kiado, by_kiados_jog, skipped = scan_csv(
        path,
        hu_focus=args.hu_focus,
        include_with_kiado=args.include_with_kiado,
        build_kiado_tables=not args.skip_kiado_tables,
    )

    solo_ranked = rank_entities(by_solo, min_works=args.min_works)
    suffix = "_hu" if args.hu_focus else ""
    solo_csv = args.out_dir / f"artisjus_smoke_solo_jogosult{suffix}.csv"
    write_csv(solo_csv, solo_ranked, entity_type="solo_jogosult", hints=args.hints)

    print(f"\nSolo persons: {len(by_solo):,} | rows: {skipped['accepted_solo_person_rows']:,}")
    print(f"Rows with zeneműkiadó: {skipped['rows_with_zenemu_kiado']:,}")
    print(f"Skip breakdown: {skipped}")
    print(f"Wrote {solo_csv}")

    focus = " [HU]" if args.hu_focus else ""
    print_table(
        f"A) Indie jogosultak (zeneműkiadó nélkül){focus} — min {args.min_works} mű",
        solo_ranked,
        top=args.top,
        hints=args.hints,
    )

    if not args.skip_kiado_tables:
        kiado_ranked = rank_entities(by_kiado, min_works=max(3, args.min_works // 2))
        kiados_jog_ranked = rank_entities(by_kiados_jog, min_works=max(3, args.min_works // 2))

        kiado_csv = args.out_dir / f"artisjus_smoke_zenemu_kiado{suffix}.csv"
        kiados_jog_csv = args.out_dir / f"artisjus_smoke_kiados_jogosult{suffix}.csv"
        write_csv(kiado_csv, kiado_ranked, entity_type="zenemu_kiado", hints=args.hints)
        write_csv(kiados_jog_csv, kiados_jog_ranked, entity_type="kiados_jogosult", hints=args.hints)

        print(f"\nZeneműkiadók: {len(by_kiado):,} | kiadós sorokon jogosultak: {len(by_kiados_jog):,}")
        print(f"Wrote {kiado_csv}")
        print(f"Wrote {kiados_jog_csv}")

        print_table(
            f"B) Zeneműkiadók (ahol kitöltött){focus} — min {max(3, args.min_works // 2)} mű",
            kiado_ranked,
            top=args.top,
            hints=args.hints,
        )
        print_table(
            f"C) Személy jogosult + zeneműkiadó együtt (ugyanazon a soron){focus}",
            kiados_jog_ranked,
            top=args.top,
            hints=args.hints,
        )
        print(
            "\n  C magyarázat: a CSV sorban egyszerre van kitöltve jogosultak ÉS zenemu_kiado."
            "\n  Nem azt jelenti, hogy a jogosult „a kiadó” — hanem hogy a tétel kiadói "
            "adminisztráció alatt szerepel."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
