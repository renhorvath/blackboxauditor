<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Projekt kontextus

- **Adatgépen dolgozol?** Olvasd el először: `HANDOFF.md`, majd `DATA_SETUP.md`
- **Üzleti háttér / adatforrások:** `music-metadata-audit-projekt-riport.md`
- **Helyi fájlok katalógus:** `SOURCES.md` (`raw/cmo/`, `raw/mlc/`)
- **EU CMO kutatás (CRM Art. 13):** `docs/research/European_CMO_Unidentified_Works_Registry_Report_Corrected.txt`
- **MLC batch scriptek:** `scripts/mlc/README.md`
- **MLC ETL (DuckDB):** `scripts/etl/README.md`
- **Nagy fájlok nem a repóban** — pathok `.env.local`-ben (`MLC_UNMATCHED_TSV`, `ARTISJUS_CSV_PATH`, stb.)
