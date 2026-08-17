# @qualia/kbo

Belgian KBO (Crossroads Bank for Enterprises) registry — DuckDB or PostgreSQL storage, ETL loaders, lookup service, and local analysis dashboard.

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
| `KBO_STORAGE`               | `duckdb`                               | Storage backend: `duckdb` for local use or `postgres` for a shared PostgreSQL database. |
| `KBO_DATABASE_PATH`         | `%LOCALAPPDATA%/qualia-kbo/kbo.duckdb` | Persisted DuckDB file when `KBO_STORAGE=duckdb`. Set it to a non-OneDrive local folder on corporate devices. |
| `KBO_DATABASE_URL`          | —                                      | PostgreSQL connection string when `KBO_STORAGE=postgres`. |
| `NBB_CBSO_SUBSCRIPTION_KEY` | —                                       | NBB CBSO API subscription key (annual accounts)                                    |
| `NBB_CBSO_BASE_URL`         | `https://ws.cbso.nbb.be`               | NBB CBSO API base URL (UAT:`https://ws.uat2.cbso.nbb.be`)                        |

## Scripts

| Script                                                                                                                                                                           | Description                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run db:init`                                                                                                                                                              | Create/upgrade the local DuckDB schema                                                 |
| `npm run load:all`                                                                                                                                                             | Full ETL pipeline (add`--upsert` for upsert mode)                                    |
| `npm run load:missing`                                                                                                                                                         | Load only empty or incomplete tables (skips tables that already match the CSV; add `--upsert` for upsert mode) |
| `npm run load:code`, `load:enterprise`, `load:establishment`, `load:address`, `load:contact`, `load:denomination`, `load:branch`, `load:activity`, `load:meta` | Import one corresponding CSV file from`data/`                                        |
| `npm run load:activity`                                                                                                                                                        | Load`data/activity.csv` only (NACE-BEL activities)                                   |
| `npm run load:audit`                                                                                                                                                           | Compare every loaded table with its eligible, de-duplicated CSV rows                   |
| `npm run report:nace-postcodes`                                                                                                                                                | Prompt for a NACE code and write an Excel-ready postal-code count CSV                  |
| `npm run report:nace-nbb`                                                                                                                                                      | Write an Excel-ready NACE/postal-code company report enriched from NBB annual accounts |
| `npm run dashboard`                                                                                                                                                            | Start the local KBO Navigator browser dashboard at `http://localhost:4173`             |
| `npm run check:types`                                                                                                                                                          | TypeScript check                                                                       |
| `npm test`                                                                                                                                                                     | Vitest unit tests                                                                      |

### PostgreSQL backend

DuckDB is the default and suits a single-user local installation. To use PostgreSQL as a shared backend, start the included database and set the storage variables before running database initialization and the loaders:

```bash
docker compose up -d
KBO_STORAGE=postgres
KBO_DATABASE_URL=postgresql://kbo:kbo@localhost:5436/kbo
npm run db:init
npm run load:all
```

On PowerShell, set the two variables with `$env:KBO_STORAGE = 'postgres'` and `$env:KBO_DATABASE_URL = 'postgresql://kbo:kbo@localhost:5436/kbo'`. Each deployment uses one active backend at a time; the application does not automatically synchronize DuckDB and PostgreSQL data.

To run the optional PostgreSQL integration test on a machine with a PostgreSQL instance, set `KBO_POSTGRES_TEST_URL` to a disposable database connection string before running `npm test`.

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

### Local dashboard

Start the dashboard after loading the KBO tables:

```bash
npm run dashboard
```

Open `http://localhost:4173` in a browser. Select a NACE-BEL version and activity, then use the postal-code pivot to filter, sort, and select a market combination. Click a postal code (or Analyse) to open the matching enterprise list. Beneath that list, expand **NBB report options** to choose fiscal years and financial fields, then run the NBB report.

Completed dashboard reports are stored in local DuckDB. Returning to the same NACE activity, classification, postcode, years, and fields loads the latest saved result instead of requesting NBB again. Use the results table's **Columns** control to choose displayed measures or **Pivot by company** to compare one measure by fiscal year. You can also drop a previously exported NBB CSV into the page for browser-only analysis; it is not uploaded to an external service. Set `KBO_DASHBOARD_PORT` if port `4173` is already in use.

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

Add `--history-years 3` to create one row per company and fiscal year for the requested year plus the two preceding years:

```bash
npm run report:nace-nbb -- 62010 1000 --fiscal-year 2025 --history-years 3 --nace-version 2025 --classification MAIN
```

Use `--years` when the selected years are not a consecutive history (for example `--years 2025,2023,2021`). Use `--fields` to limit the financial columns exported. Supported fields are `revenue`, `net-result`, `employees`, `total-assets`, `equity`, `cash`, `financial-debt`, `receivables`, and `payables`:

```bash
npm run report:nace-nbb -- 62010 1000 --fiscal-year 2025 --years 2025,2024,2022 --nace-version 2025 --classification MAIN --fields revenue,net-result,employees,total-assets,equity
```

The report reads NBB's public CSV export generated from each published XBRL filing; `NBB_CBSO_SUBSCRIPTION_KEY` is not required for this command. It exports revenue, net profit/loss, total employees (FTE), total assets, equity, cash and investments, financial debt, trade receivables, trade payables, NBB reference/deposit metadata, and a `Financial data status` column. Blank values mean that NBB did not provide the applicable rubric; they do not mean zero. Companies that did not file accounts for the requested year are retained with a status.

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
