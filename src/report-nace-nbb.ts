import { config as loadEnvironment } from 'dotenv';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listEnterprisesByNaceAndPostalCode, type NacePostalEnterprise } from './activity';
import { disconnectKboClient } from './client';
import { fetchPublicConsultFinancials, NbbPublicConsultError } from './nbb/publicConsult';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnvironment({
  path: [path.join(packageRoot, '.env'), path.join(packageRoot, '..', '.env')],
});

type FinancialStatus = 'ok' | 'partial_financial_data' | 'no_account_for_year' | 'no_accounting_data' | 'accounting_pdf_only' | 'fetch_failed';
type CachedFinancialResult = {
  enterpriseNumber: string;
  nbbName?: string;
  returnedFiscalYear?: number;
  revenue: number | null;
  employeeCount: number | null;
  netResult?: number | null;
  totalAssets?: number | null;
  equity?: number | null;
  cashAndInvestments?: number | null;
  financialDebt?: number | null;
  tradeReceivables?: number | null;
  tradePayables?: number | null;
  fixedAssets?: number | null;
  currentAssets?: number | null;
  currentLiabilities?: number | null;
  provisions?: number | null;
  operatingResult?: number | null;
  depreciation?: number | null;
  retainedEarnings?: number | null;
  referenceNumber?: string;
  depositDate?: string;
  message?: string;
  status: FinancialStatus;
};
type ReportRow = NacePostalEnterprise & CachedFinancialResult;
type FinancialField = {
  option: string;
  header: string;
  value: (row: ReportRow) => number | null | undefined;
};
const financialFields: FinancialField[] = [
  { option: 'revenue', header: 'Revenue EUR', value: (row) => row.revenue },
  { option: 'net-result', header: 'Net profit/loss EUR', value: (row) => row.netResult },
  { option: 'employees', header: 'Total employees FTE', value: (row) => row.employeeCount },
  { option: 'total-assets', header: 'Total assets EUR', value: (row) => row.totalAssets },
  { option: 'equity', header: 'Equity EUR', value: (row) => row.equity },
  { option: 'cash', header: 'Cash and investments EUR', value: (row) => row.cashAndInvestments },
  { option: 'financial-debt', header: 'Financial debt EUR', value: (row) => row.financialDebt },
  { option: 'receivables', header: 'Trade receivables EUR', value: (row) => row.tradeReceivables },
  { option: 'payables', header: 'Trade payables EUR', value: (row) => row.tradePayables },
  { option: 'profit-margin', header: 'Net profit margin %', value: (row) => row.revenue && row.netResult !== undefined && row.netResult !== null ? Math.round(row.netResult / row.revenue * 10000) / 100 : null },
  { option: 'fixed-assets', header: 'Fixed assets EUR', value: (row) => row.fixedAssets },
  { option: 'current-assets', header: 'Current assets EUR', value: (row) => row.currentAssets },
  { option: 'current-liabilities', header: 'Current liabilities EUR', value: (row) => row.currentLiabilities },
  { option: 'provisions', header: 'Provisions and deferred taxes EUR', value: (row) => row.provisions },
  { option: 'operating-result', header: 'Operating result EUR', value: (row) => row.operatingResult },
  { option: 'depreciation', header: 'Depreciation and impairments EUR', value: (row) => row.depreciation },
  { option: 'retained-earnings', header: 'Retained earnings EUR', value: (row) => row.retainedEarnings },
];

function getOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requiredOption(name: string): string {
  const value = getOption(name)?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function csvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

async function loadCache(cachePath: string): Promise<Record<string, CachedFinancialResult[]>> {
  try {
    return JSON.parse(await readFile(cachePath, 'utf8')) as Record<string, CachedFinancialResult[]>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

async function saveCache(cachePath: string, cache: Record<string, CachedFinancialResult[]>): Promise<void> {
  await mkdir(path.dirname(cachePath), { recursive: true });
  const temporaryPath = `${cachePath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(cache), 'utf8');
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rename(temporaryPath, cachePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }

  // OneDrive or an antivirus scanner can temporarily lock a replacement target on Windows.
  // The default cache lives outside OneDrive; this fallback also preserves progress for custom cache paths.
  await writeFile(cachePath, JSON.stringify(cache), 'utf8');
}

async function retrieveFinancials(enterpriseNumber: string, requestedYears: number[], requestDelayMs: number): Promise<CachedFinancialResult[]> {
  try {
    const result = await fetchPublicConsultFinancials(enterpriseNumber, requestedYears, fetch, { requestDelayMs });
    if (result.years.length === 0) return [{ enterpriseNumber, nbbName: result.enterpriseName, revenue: null, employeeCount: null, status: 'no_account_for_year' }];
    return result.years.map((account) => {
      if (account.error === 'no_json') return { enterpriseNumber, nbbName: result.enterpriseName, returnedFiscalYear: account.fiscalYear, revenue: null, employeeCount: null, referenceNumber: account.referenceNumber, depositDate: account.depositDate, status: 'no_accounting_data' as const };
      if (account.error === 'unsupported_format') return { enterpriseNumber, nbbName: result.enterpriseName, returnedFiscalYear: account.fiscalYear, revenue: null, employeeCount: null, referenceNumber: account.referenceNumber, depositDate: account.depositDate, status: 'accounting_pdf_only' as const, message: 'NBB returned the annual account as PDF, not machine-readable accounting data.' };
      if (account.error === 'fetch_failed') return { enterpriseNumber, revenue: null, employeeCount: null, status: 'fetch_failed' as const, message: 'NBB could not retrieve the published XBRL CSV export.' };
      const status: CachedFinancialResult['status'] = account.revenue === null || account.employeeCount === null ? 'partial_financial_data' : 'ok';
      return { enterpriseNumber, nbbName: result.enterpriseName, returnedFiscalYear: account.fiscalYear, revenue: account.revenue, netResult: account.netResult, employeeCount: account.employeeCount, totalAssets: account.totalAssets, equity: account.equity, cashAndInvestments: account.cashAndInvestments, financialDebt: account.financialDebt, tradeReceivables: account.tradeReceivables, tradePayables: account.tradePayables, fixedAssets: account.fixedAssets, currentAssets: account.currentAssets, currentLiabilities: account.currentLiabilities, provisions: account.provisions, operatingResult: account.operatingResult, depreciation: account.depreciation, retainedEarnings: account.retainedEarnings, referenceNumber: account.referenceNumber, depositDate: account.depositDate, status };
    });
  } catch (error) {
    const message = error instanceof NbbPublicConsultError ? error.message : 'NBB request failed before a filing could be selected.';
    return [{ enterpriseNumber, revenue: null, employeeCount: null, status: 'fetch_failed' as const, message }];
  }
}

const naceCode = process.argv[2]?.trim();
const postalCode = process.argv[3]?.trim();
if (!naceCode || naceCode.startsWith('--') || !postalCode || postalCode.startsWith('--')) throw new Error('Usage: npm run report:nace-nbb -- <nace-code> <postal-code> --fiscal-year <year>');
const fiscalYear = Number.parseInt(requiredOption('--fiscal-year'), 10);
if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2100) throw new Error('--fiscal-year must be a four-digit year.');
const naceVersion = getOption('--nace-version');
const classification = getOption('--classification');
const historyYears = Math.min(10, Math.max(1, Number.parseInt(getOption('--history-years') ?? '1', 10) || 1));
const explicitYears = getOption('--years')?.split(',').map((year) => Number.parseInt(year.trim(), 10)).filter((year) => Number.isInteger(year) && year >= 1900 && year <= 2100);
if (explicitYears && explicitYears.length === 0) throw new Error('--years must be a comma-separated list of four-digit fiscal years.');
const requestedYears = explicitYears ? [...new Set(explicitYears)].sort((left, right) => right - left) : Array.from({ length: historyYears }, (_, index) => fiscalYear - index);
const requestedFieldOptions = getOption('--fields')?.split(',').map((field) => field.trim()).filter(Boolean);
const selectedFinancialFields = requestedFieldOptions ? financialFields.filter((field) => requestedFieldOptions.includes(field.option)) : financialFields;
if (requestedFieldOptions && selectedFinancialFields.length === 0) throw new Error(`--fields must include at least one of: ${financialFields.map((field) => field.option).join(', ')}.`);
const concurrency = Math.min(3, Math.max(1, Number.parseInt(getOption('--concurrency') ?? '1', 10) || 1));
const requestDelayMs = Math.max(0, Number.parseInt(getOption('--request-delay-ms') ?? '750', 10) || 750);
const reportPath = path.resolve(getOption('--output') ?? `reports/nace-${naceCode}-postal-${postalCode}-fy${fiscalYear}.csv`);
const defaultCacheDir = path.resolve(process.env.LOCALAPPDATA ?? packageRoot, 'qualia-kbo', 'report-cache');
const cachePath = path.resolve(getOption('--cache') ?? path.join(defaultCacheDir, `nace-${naceCode}-postal-${postalCode}-years${requestedYears.join('-')}.json`));
const reset = process.argv.includes('--reset');

try {
  const companies = await listEnterprisesByNaceAndPostalCode(naceCode, postalCode, { naceVersion, classification });
  const cache = reset ? {} : await loadCache(cachePath);
  let cacheWrite = Promise.resolve();
  const missing = companies.filter((company) => !cache[company.enterpriseNumber]);
  console.log(`Selected ${companies.length.toLocaleString()} companies; ${missing.length.toLocaleString()} NBB requests remaining.`);

  let completed = 0;
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, missing.length) }, async () => {
    while (cursor < missing.length) {
      const company = missing[cursor++];
      const result = await retrieveFinancials(company.enterpriseNumber, requestedYears, requestDelayMs);
      completed += 1;
      if (!result.some((entry) => entry.status === 'fetch_failed')) {
        cache[company.enterpriseNumber] = result;
        cacheWrite = cacheWrite.then(() => saveCache(cachePath, cache));
        await cacheWrite;
      }
      console.log(`NBB: ${completed}/${missing.length} (${result.map((entry) => entry.status).join(', ')}) — ${company.enterpriseNumber}`);
    }
  }));

  const rows: ReportRow[] = companies.flatMap((company) => (cache[company.enterpriseNumber] ?? [{ enterpriseNumber: company.enterpriseNumber, revenue: null, employeeCount: null, status: 'fetch_failed' as const, message: 'NBB request did not complete; rerun the report to retry.' }]).map((financials) => ({ ...company, ...financials })));
  const header = ['Enterprise number', 'KBO name', 'NBB name', 'Postal code', 'NACE code', 'NACE version', 'Classification', 'Requested fiscal year', 'History years requested', 'Returned fiscal year', ...selectedFinancialFields.map((field) => field.header), 'Financial data status', 'NBB message', 'NBB reference', 'NBB deposit date'];
  const csv = [header.join(','), ...rows.map((row) => [row.enterpriseNumber, row.name, row.nbbName, row.postalCode, naceCode, naceVersion, classification, fiscalYear, requestedYears.length, row.returnedFiscalYear, ...selectedFinancialFields.map((field) => field.value(row)), row.status, row.message, row.referenceNumber, row.depositDate].map(csvValue).join(','))].join('\r\n');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `\uFEFF${csv}\r\n`, 'utf8');
  console.log(`${rows.length.toLocaleString()} company rows written to ${reportPath}`);
} finally {
  await disconnectKboClient();
}