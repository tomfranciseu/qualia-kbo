# Getting started: NACE reports

This guide explains the two report queries in plain language:

1. **How many enterprises have a NACE code, by postal code?**
2. **Which enterprises have a NACE code in one postal code, and what are their NBB revenue and employee figures?**

Both reports use the locally loaded KBO database. The second report also calls the NBB annual-accounts service.

## Before running a report

From the repository folder, make sure the KBO data has been loaded and checked:

```powershell
npm run load:audit
```

For NACE reports, `Activity`, `Enterprise`, `Establishment`, and `KBOAddress` need to show `MATCH`.

### NACE options

- **NACE code**: the five-digit activity code, for example `62010`.
- **NACE version**: use this when comparing data from one classification version, for example `2025`.
- **Classification**: `MAIN` means primary activity; omit it to include all activity classifications.
- **Postal code**: the registered-office postal code of the enterprise, for example `2840`.

An enterprise is counted once even when the NACE code is registered several times or is registered on one of its establishments.

## Query 1: number of enterprises by postal code

Use this to discover where enterprises with an activity are located.

```powershell
npm run report:nace-postcodes -- 62010 --nace-version 2025 --classification MAIN
```

If the NACE code is omitted, the command asks for it interactively:

```powershell
npm run report:nace-postcodes
```

The CSV is created in the `reports` folder. For the first example it is named `nace-62010-postal-codes.csv`.

### Output columns

| Column | Meaning |
|---|---|
| `Postal code` | Registered-office postal code from KBO (`REGO` address). |
| `Enterprise count` | Number of distinct enterprises matching the requested NACE criteria. |

### Use it in Excel

1. Select **Data → Get Data → From Text/CSV**.
2. Select the generated CSV in the `reports` folder.
3. Select **Load**.
4. Select **Insert → PivotTable**.
5. Put `Postal code` in **Rows** and `Enterprise count` in **Values** using **Sum**.

Run the same report again after refreshing KBO data, then use **Data → Refresh All** in Excel.

## Query 2: company details for one NACE code and postal code

Use this after query 1 identifies a postal code of interest. It returns the companies and, where annual accounts are available, NBB revenue and average employee count for one comparable fiscal year.

### Configure NBB access

The report downloads NBB's public CSV export generated from each published XBRL filing. No NBB subscription key is required for this report.

### Run the report

```powershell
npm run report:nace-nbb -- 62010 2840 --fiscal-year 2024 --nace-version 2025 --classification MAIN
```

The arguments are:

| Argument | Required | Meaning |
|---|---:|---|
| First value (`62010`) | Yes | NACE code. |
| Second value (`2840`) | Yes | Registered-office postal code. |
| `--fiscal-year 2024` | Yes | Preferred annual-account fiscal year. If unavailable, the report checks 2023 and then 2022. |
| `--nace-version 2025` | No | Restrict to a NACE version. |
| `--classification MAIN` | No | Restrict to primary activities. |

The default output is `reports/nace-62010-postal-2840-fy2024.csv`.

### Output columns

| Column | Meaning |
|---|---|
| `Enterprise number` | KBO enterprise identifier. |
| `KBO name` | Dutch KBO denomination when available. |
| `NBB name` | Company name returned by NBB annual accounts when available. |
| `Postal code` | Requested KBO registered-office postal code. |
| `NACE code`, `NACE version`, `Classification` | The report criteria. |
| `Requested fiscal year` | The year supplied in the command. |
| `Fallback fiscal years checked` | Requested year followed by the two preceding years. |
| `Returned fiscal year` | Fiscal year returned by NBB; it may be one of the fallback years. |
| `Revenue EUR` | Revenue extracted from the applicable NBB accounting rubric, in EUR. Blank is not zero. |
| `Total employees FTE` | Average full-time-equivalent employee count from NBB. Blank is not zero. |
| `Financial data status` | Explains whether a usable annual account was found. |
| `NBB reference`, `NBB deposit date` | Traceability fields for the annual-account filing. |

### Financial data statuses

| Status | Meaning |
|---|---|
| `ok` | Revenue and employee count were both available. |
| `partial_financial_data` | An annual account was found, but revenue or employee count was unavailable. |
| `no_account_for_year` | NBB has no annual account for this company and requested fiscal year. |
| `no_accounting_data` | A filing reference exists but NBB did not provide accounting data. |
| `accounting_pdf_only` | NBB returned the filing as a PDF rather than machine-readable accounting data, so revenue and FTE cannot be extracted automatically. |
| `fetch_failed` | The NBB request could not be completed. Run the command again to retry. |

Not all enterprises are required to file annual accounts, so blank values and `no_account_for_year` are expected for some companies.

## Large reports and retrying

The company-detail report makes one NBB request at a time by default and waits 750 ms between requests. For a slower, cautious run use:

```powershell
npm run report:nace-nbb -- 62010 2840 --fiscal-year 2024 --request-delay-ms 1500
```

The report saves completed NBB results in `%LOCALAPPDATA%/qualia-kbo/report-cache`, outside OneDrive to avoid Windows sync locks. If it is interrupted, run the exact same command again; completed companies are reused and only missing companies are requested. Temporary NBB `429` and `503` responses are retried automatically. `fetch_failed` companies are not cached, so a rerun retries them. Use `--cache path/to/cache.json` to set a custom checkpoint location.

To deliberately fetch all companies again, add `--reset`:

```powershell
npm run report:nace-nbb -- 62010 2840 --fiscal-year 2024 --reset
```

## Suggested Excel analysis

Import the company-detail CSV with **Data → Get Data → From Text/CSV**. Create a PivotTable and use:

- `Financial data status` as a filter, normally selecting `ok` and optionally `partial_financial_data`.
- `Revenue EUR` as a sum, average, minimum, or maximum.
- `Total employees FTE` as a sum or average.
- `Postal code` or `NACE code` as rows if the report criteria are later broadened.

Do not replace blank revenue or FTE values with zero unless that is explicitly the desired business rule. A blank means the value was unavailable, not that the enterprise had no revenue or employees.