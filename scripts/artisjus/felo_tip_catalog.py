"""
ARTISJUS felosztási típus (felo.tip) kódok — forrás: Felosztási típusok kódjai.pdf (2026).

A smoke leaderboard és más aggregációk ezt használják; ne találgass prefixekből.
"""

from __future__ import annotations

# --- Filmzene (filmalkotás / mozi / TV-film / külföldi film) ---
FILM_TIPS = frozenset(
    {
        "DVFAA",
        "DVFAM",
        "FZM",
        "FZT",
        "KF",
        "KRATEKF",
        "KRFZTET",
        "RFZTET",
        "RFZTETK",
        "RFZTIS",
        "RFZTNY",
        "RFZTPVR",
        "RFZTUK",
        "SAFA",
        "SAFM",
        "SEFAA",
        "SEFAM",
        "SVFAA",
        "SVFAM",
        "XFZM",
    }
)

# --- Zenei streaming (nem film) ---
MUSIC_STREAMING_TIPS = frozenset(
    {
        "HSAA",
        "HSAM",
        "NSAA",
        "NSAM",
        "RNSAA",
        "RNSAM",
        "STAHA",
        "STAHM",
        "TNSAA",
        "TNSAM",
        "TRNSAA",
        "TRNSAM",
    }
)

# --- TV: konkrét / funkcionális zene (nem filmzene) ---
TV_MUSIC_TIPS = frozenset(
    {
        "AT",
        "ATF",
        "KRATEK",
        "RATEK",
        "RATEK2",
        "RATEKF",  # funkcionális — PDF szerint nem film
        "RATEKF2",
        "RATEKK",
        "RATEKKF",
        "RATIS",
        "RATISF",
        "RATM",
        "RATMF",
        "RATNY",
        "RATNYF",
        "RATPVR",
        "RATPVRF",
        "RATUK",
        "RATUKF",
        "XATF",
        "XTVM",
        "XTVUH",
        "XRATEK",
        "XRATNY",
    }
)

# --- Külföldi reciprocity (nem film-specifikus) ---
FOREIGN_KA_KM = frozenset({"KA", "KM"})

# --- Rádió ---
RADIO_TIPS = frozenset(
    {
        "AIR",
        "AIRS",
        "AR",
        "RAREK2",
        "RARIS",
        "RARM",
        "RARNY",
        "RART",
        "RARUH",
        "XAIR",
        "XAR",
        "XRARNY",
        "XRM",
        "XRUH",
        "XRUH2",
    }
)

# Kategória nevek a leaderboard oszlopokhoz
CATEGORY_FILM = "film"
CATEGORY_MUSIC_STREAM = "music_stream"
CATEGORY_TV = "tv"
CATEGORY_FOREIGN = "foreign"
CATEGORY_RADIO = "radio"
CATEGORY_OTHER = "other"


def parse_felo_tip(raw: str | None) -> str:
    """Első token a felo_tip mezőből (pl. 'TNSAA/2025/31' → 'TNSAA')."""
    text = (raw or "").strip()
    return text.split()[0] if text else ""


def classify_felo_tip(raw: str | None) -> str:
    tip = parse_felo_tip(raw)
    if not tip:
        return CATEGORY_OTHER
    if tip in FILM_TIPS:
        return CATEGORY_FILM
    if tip in MUSIC_STREAMING_TIPS:
        return CATEGORY_MUSIC_STREAM
    if tip in TV_MUSIC_TIPS:
        return CATEGORY_TV
    if tip in FOREIGN_KA_KM:
        return CATEGORY_FOREIGN
    if tip in RADIO_TIPS:
        return CATEGORY_RADIO
    return CATEGORY_OTHER


def is_film_tip(raw: str | None) -> bool:
    return classify_felo_tip(raw) == CATEGORY_FILM


def is_music_streaming_tip(raw: str | None) -> bool:
    return classify_felo_tip(raw) == CATEGORY_MUSIC_STREAM
