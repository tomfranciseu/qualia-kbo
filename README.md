# @qualia/kbo

Belgian KBO (Crossroads Bank for Enterprises) registry — local embedded DuckDB database, ETL loaders, and lookup service.

For a business-user walkthrough of the NACE postcode and NBB company-detail reports, see [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md).

## Quickstart

```bash
cp .env.example .env
npm install
npm run db:init
# Drop open-data CSVs into data/
npm run load:all
```

## Environment

| Variable                      | Default                                  | Description                                                                        |
| ----------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `KBO_DATABASE_PATH`         | `%LOCALAPPDATA%/qualia-kbo/kbo.duckdb` | Persisted DuckDB file. Set it to a non-OneDrive local folder on corporate devices. |
| `NBB_CBSO_SUBSCRIPTION_KEY` | —                                       | NBB CBSO API subscription key (annual accounts)                                    |
| `NBB_CBSO_BASE_URL`         | `https://ws.cbso.nbb.be`               | NBB CBSO API base URL (UAT:`https://ws.uat2.cbso.nbb.be`)                        |

## Scripts

| Script                                                                                                                                                                           | Description                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run db:init`                                                                                                                                                              | Create/upgrade the local DuckDB schema                                                 |
| `npm run load:all`                                                                                                                                                             | Full ETL pipeline (add`--upsert` for upsert mode)                                    |
| `npm run load:code`, `load:enterprise`, `load:establishment`, `load:address`, `load:contact`, `load:denomination`, `load:branch`, `load:activity`, `load:meta` | Import one corresponding CSV file from`data/`                                        |
| `npm run load:activity`                                                                                                                                                        | Load`data/activity.csv` only (NACE-BEL activities)                                   |
| `npm run load:audit`                                                                                                                                                           | Compare every loaded table with its eligible, de-duplicated CSV rows                   |
| `npm run report:nace-postcodes`                                                                                                                                                | Prompt for a NACE code and write an Excel-ready postal-code count CSV                  |
| `npm run report:nace-nbb`                                                                                                                                                      | Write an Excel-ready NACE/postal-code company report enriched from NBB annual accounts |
| `npm run check:types`                                                                                                                                                          | TypeScript check                                                                       |
| `npm test`                                                                                                                                                                     | Vitest unit tests                                                                      |

## Consumption from monday2.0

```json
"@qualia/kbo": "github:tomfranciseu/qualia-kbo#v0.3.0"
```

Set `KBO_DATABASE_PATH` on the app runtime for Belgian VAT autofill from local KBO data. Without it, the app falls back to VIES.

### Search enterprises by NACE-BEL

```typescript
import { listEnterprisesByNaceCode } from '@qualia/kbo';

const { enterprises, total } = await listEnterprisesByNaceCode('62010', {
  naceVersion: '2025',
  classification: 'MAIN',
  limit: 50,
  offset: 0,
});
```

Requires `activity.csv` loaded (`npm run load:activity` or `load:all`).

### Enterprises by NACE-BEL and postal code

Create a CSV with one row per registered-office postal code. It counts each enterprise once, whether the matching NACE activity belongs to the enterprise itself or one of its establishments.

```bash
npm run report:nace-postcodes -- 62010 --nace-version 2025 --classification MAIN
```

Without a code argument, the command prompts for one. The default output is `reports/nace-62010-postal-codes.csv`; override it with `--output path/to/report.csv`.

In Excel, use **Data → Get Data → From Text/CSV** to import the CSV, then choose **Insert → PivotTable**. Put `Postal code` in **Rows** and `Enterprise count` in **Values** (Sum). After regenerating the CSV for the same code, use **Data → Refresh All**.

### Company annual-account report for a NACE code and postal code

Generate one Excel-ready row per enterprise for a NACE code and its registered-office postal code. Activities registered on an establishment are included and an enterprise is listed once. A fiscal year is required so figures are comparable between companies; when it is unavailable, the report checks the two preceding years.

```bash
npm run report:nace-nbb -- 62010 1000 --fiscal-year 2024 --nace-version 2025 --classification MAIN
```

The report reads NBB's public CSV export generated from each published XBRL filing; `NBB_CBSO_SUBSCRIPTION_KEY` is not required for this command. It has revenue in EUR, total employees in FTE, NBB reference/deposit metadata, and a `Financial data status` column. Blank revenue or employee values mean that NBB did not provide the applicable rubric; they do not mean zero. Companies that did not file accounts for the requested year are retained with a status.

The command makes one NBB request at a time by default, waits 750 ms between requests, and retries temporary `429` and `503` responses with backoff. This avoids public-service throttling on large reports. Use `--request-delay-ms 1500` to slow it further if NBB still returns throttling errors; `--concurrency` is capped at 3. Checkpoints are written under `%LOCALAPPDATA%/qualia-kbo/report-cache` to avoid OneDrive file-locking issues. Re-run the same command to continue an interrupted report; failed companies are not cached and are retried. Use `--reset` to discard that checkpoint, `--output path/to/report.csv` to choose the CSV destination, or `--cache path/to/cache.json` to set a custom checkpoint location.

In Excel import the CSV via **Data → Get Data → From Text/CSV**. Revenue and employee columns import as numbers and can be summed or averaged in a PivotTable; use `Financial data status` as a filter to exclude unavailable values from analysis.

### NBB annual accounts (financials)

```typescript
import { fetchCompanyFinancials, checkNbbConfigured } from '@qualia/kbo';

if (checkNbbConfigured()) {
  const financials = await fetchCompanyFinancials('0123456789', { years: 5 });
  // financials.years[].revenue, netResult, marginPercent, employeeCount
}
```

Set `NBB_CBSO_SUBSCRIPTION_KEY` from the [NBB developer portal](https://developer.cbso.nbb.be).

## Production operations (deferred)

1. Build and archive a refreshed DuckDB file with `npm run db:init && npm run load:all` after downloading fresh KBO open data.
2. Distribute the versioned file to the application runtime and set `KBO_DATABASE_PATH`.
3. Use a managed PostgreSQL service only if the data must be written concurrently or shared by several app servers.
