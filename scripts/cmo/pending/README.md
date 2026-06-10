# Phase 4 — pending CMO integrations

These sources need manual refresh or member-only access. Web stubs live in `lib/cmo-web/adapters/pending.ts`.

| Source | Country | Blocker | Manual steps |
|--------|---------|---------|--------------|
| **PRS** | UK | Monthly PDF value bands | Download from [prsformusic.com/royalties/claim-unpaid-royalties](https://www.prsformusic.com/royalties/claim-unpaid-royalties) → parse to CSV |
| **SGAE** | ES | PDF, Spanish | Policy PDF + list discoverability — parser TBD |
| **BUMA/Stemra** | NL | Airplayclaim web / tagi | Authors reciprocity; neighbouring covered by SENA bulk |

Enable stubs for experiments: `CMO_WEB_ENABLED=prs,sgae,buma` (returns empty until parsers exist).

UCMR-ADA PDF: use `python3 scripts/cmo/parse_ucmr_pdf.py path/to/monthly.pdf`.
