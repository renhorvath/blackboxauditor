# MLC Hungarian unmatched pipeline

Scripts to filter Hungarian candidates from the MLC `unmatchedresources.tsv` dump.

## Prerequisites

- Python 3.10+
- `.env.local` with `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` (cross-check only)
- Existing `hungarian_unmatched_export.csv` from the HU ISRC pass (in `MLC_HU_DATA_DIR`)

## Paths

Set in `.env.local` or environment:

| Variable | Default |
|----------|---------|
| `MLC_UNMATCHED_TSV` | `/Users/ren/autotrader/unmatchedresources.tsv` |
| `MLC_HU_DATA_DIR` | `/Users/ren/synchreload` |

## Workflow

### 0. Popular Hungarian artist list (start here)

Curated Spotify list — **not** a full TSV scan.

```bash
cd scripts/mlc
python3 fetch_hu_popular_artists.py
```

**Rules (defaults):**
- **Modern seed:** Spotify match + **≥ 10k followers** + not classical/folk genres
- **Legacy seed:** régi nagy nevek, follower küszöb **nincs**
- **Classical / népzene:** kizárva (genre filter)
- **Playlist mining:** kikapcsolva (zajos); `--include-playlists` ha kell

→ `hu_popular_artists.csv` (~70 review-olható előadó)

### 1. HU ISRC pass (done)

```bash
python3 /Users/ren/synchreload/filter_hungarian_unmatched.py --layers hu_isrc
```

→ `hungarian_unmatched_export.csv` (~259k ISRCs)

### 2. MusicBrainz Hungarian artist index

```bash
cd scripts/mlc
python3 fetch_mb_hu_artists.py
```

→ `mb_hu_artists.json`, `mb_hu_artist_names.txt` (~1 req/sec, ~10–30 min)

### 3. Spotify cross-check (validate non-HU ISRC gap)

Fast — Spotify only:

```bash
cd scripts/mlc
python3 spotify_hu_crosscheck.py
```

Full — also scan 121GB TSV (~45 min):

```bash
python3 spotify_hu_crosscheck.py --scan-tsv
```

→ `spotify_hu_crosscheck_report.csv`, `spotify_hu_crosscheck_summary.txt`

### 4. Non-HU Hungarian second pass

After MB index is ready (~46 min on 121GB TSV, progress every 5M rows):

```bash
python3 filter_non_hu_hungarian.py
```

Uses **Aho-Corasick** for fast MB name matching (not the naive O(rows×names) loop).

→ `hungarian_non_hu_export.csv` (non-HU ISRC + MB/known/diacritics match)

Log to file if running overnight:

```bash
nohup python3 filter_non_hu_hungarian.py > ../../data/mlc/non_hu_pass.log 2>&1 &
```

### 5. Scan TSV for arbitrary ISRC set

```bash
python3 scan_tsv_isrc_set.py --isrc-file isrcs.csv --output hits.csv
```

## Output files (in `MLC_HU_DATA_DIR`)

| File | Description |
|------|-------------|
| `hungarian_unmatched_export.csv` | HU prefix ISRCs |
| `hungarian_non_hu_export.csv` | Non-HU ISRC Hungarian candidates |
| `mb_hu_artists.json` | MusicBrainz artist dump |
| `spotify_hu_crosscheck_report.csv` | Per-track ISRC analysis |
| `spotify_hu_crosscheck_summary.txt` | Aggregate stats |
