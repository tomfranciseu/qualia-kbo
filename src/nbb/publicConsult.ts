import Papa from 'papaparse';
import { PDFParse } from 'pdf-parse';
import { computeMarginPercent, extractCashAndInvestments, extractCurrentAssets, extractCurrentLiabilities, extractDepreciation, extractEmployeeCount, extractEquity, extractFinancialDebt, extractFixedAssets, extractNetResult, extractOperatingResult, extractProvisions, extractRetainedEarnings, extractRevenue, extractTotalAssets, extractTradePayables, extractTradeReceivables } from './rubrics';
import type { NbbAccountingData, NbbAnnualAccountSummary, NbbRubric } from './types';

const CONSULT_BASE_URL = 'https://consult.cbso.nbb.be';
const DEFAULT_REQUEST_DELAY_MS = 750;
const DEFAULT_RETRIES = 5;

let requestQueue = Promise.resolve();

export type PublicConsultRequestOptions = {
  requestDelayMs?: number;
  retries?: number;
};

export class NbbPublicConsultError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'NbbPublicConsultError';
  }
}

type PublishedDeposit = {
  id: string;
  reference: string;
  periodEndDateYear: number;
  depositDate?: string;
  enterpriseName?: string;
  importFileType?: string;
};

type PublishedDepositResponse = { content?: PublishedDeposit[] };

function normalizeEnterpriseNumber(input: string): string {
  return input.replaceAll(/\D/g, '');
}

function parseCsvAccountingData(csv: string): NbbAccountingData {
  const rows = Papa.parse<string[]>(csv, { skipEmptyLines: true }).data;
  const values = new Map(rows.filter((row) => row.length >= 2).map(([key, value]) => [key, value]));
  return {
    EnterpriseName: values.get('Entity name'),
    ReferenceNumber: values.get('Reference number'),
    Rubrics: rows
      .filter(([code]) => /^\d/.test(code ?? ''))
      .map(([Code, Value]) => ({ Code, Value, Period: 'N' })),
  };
}

function parsePdfNumber(value: string): string | undefined {
  const normalized = value.replaceAll(/[\s.]/g, '').replace(',', '.').replace(/[()]/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  return value.includes('(') ? `-${normalized}` : normalized;
}

type InsurancePdfField = {
  code: string;
  label: RegExp;
};

const INSURANCE_PDF_FIELDS: InsurancePdfField[] = [
  { code: 'INS_EQUITY', label: /^A\.\s*(?:Eigen vermogen|Capitaux propres)\b/i },
  { code: 'INS_INVESTMENTS', label: /^C\.\s*(?:Beleggingen|Placements)\b/i },
  { code: 'INS_UNIT_LINKED_INVESTMENTS', label: /^D\.\s*(?:Beleggingen betreffende.*(?:[Ll]even|[Vv]ie)|Placements.*(?:vie|branche))\b/i },
  { code: 'INS_REINSURANCE_SHARE_TECHNICAL_PROVISIONS', label: /^D\.?(?:\s|[’'])?bis\.?\s*(?:Deel van de herverzekeraars.*technische voorzieningen|Part des réassureurs.*provisions techniques)\b/i },
  { code: 'INS_RECEIVABLES', label: /^E\.\s*(?:Vorderingen|Créances)\b/i },
  { code: 'INS_TECHNICAL_PROVISIONS', label: /^C\.\s*(?:Technische voorzieningen|Provisions techniques)\b/i },
  { code: 'INS_LIFE_TECHNICAL_PROVISIONS', label: /^II\.\s*(?:Voorziening voor verzekering\s*["“]?leven|Provision d'assurance\s*["“]?vie)\b/i },
  { code: 'INS_CLAIMS_PROVISIONS', label: /^III\.\s*(?:Voorziening voor te betalen schaden|Provision pour sinistres)\b/i },
  { code: 'INS_REINSURANCE_DEPOSITS', label: /^F\.\s*(?:Deposito's ontvangen van herverzekeraars|Dépôts reçus des réassureurs)\b/i },
  { code: 'INS_NET_RESULT', label: /^3\.\s*(?:Resultaat van het boekjaar|Résultat de l'exercice)\b/i },
];

function parseInsurancePdfRubrics(text: string): NonNullable<NbbAccountingData['Rubrics']> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rubrics: NonNullable<NbbAccountingData['Rubrics']> = [];
  const parseInsuranceAmount = (line: string): string | undefined => {
    const match = line.match(/\(?\s*[\d.]+(?:,\d+)?\s*\)?\s*$/)?.[0];
    if (!match) return undefined;
    const digits = match.replaceAll(/\D/g, '');
    return /[.,]/.test(match) || digits.length >= 4 ? parsePdfNumber(match) : undefined;
  };
  for (const field of INSURANCE_PDF_FIELDS) {
    const matches = lines.map((line, index) => ({ line, index })).filter(({ line }) => field.label.test(line));
    const value = matches.flatMap(({ line, index }) => [line, ...lines.slice(index + 1, index + 6)])
      .map(parseInsuranceAmount)
      .find((candidate): candidate is string => candidate !== undefined);
    if (value !== undefined) rubrics.push({ Code: field.code, Value: value, Period: 'N' });
  }
  return rubrics;
}

export function parsePdfAccountingData(text: string): NbbAccountingData {
  const rubrics: NbbRubric[] = text.split(/\r?\n/).flatMap((line) => {
    const match = /^\s*(\d{2,4}(?:\/\d{2,3}[A-Z]?)?|\d{2,4}[A-Z]?)\s+(.+?)\s*$/.exec(line);
    if (!match) return [];
    const value = parsePdfNumber((match[2].match(/^\(?\s*[\d.]+(?:,\d+)?\s*\)?/) ?? [])[0] ?? '');
    return value === undefined ? [] : [{ Code: match[1], Value: value, Period: 'N' as const }];
  });
  rubrics.push(...parseInsurancePdfRubrics(text));
  return { Rubrics: rubrics };
}

async function parsePdfResponse(response: Response): Promise<NbbAccountingData> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new NbbPublicConsultError('NBB returned an invalid PDF annual account.');
  const parser = new PDFParse({ data: bytes });
  try {
    const accountingData = parsePdfAccountingData((await parser.getText()).text);
    if (!accountingData.Rubrics?.length) throw new NbbPublicConsultError('NBB annual account is an image-only PDF and requires OCR.');
    return accountingData;
  } finally {
    await parser.destroy();
  }
}

function summarizeAccountingData(deposit: PublishedDeposit, accountingData: NbbAccountingData): NbbAnnualAccountSummary {
  const revenue = extractRevenue(accountingData.Rubrics);
  const netResult = extractNetResult(accountingData.Rubrics);
  const insuranceValue = (code: string): number | null => {
    const value = accountingData.Rubrics?.find((rubric) => rubric.Code === code)?.Value;
    return value === undefined ? null : Number(value);
  };
  const insuranceNetResult = insuranceValue('INS_NET_RESULT');
  const insuranceEquity = insuranceValue('INS_EQUITY');
  return { fiscalYear: deposit.periodEndDateYear, referenceNumber: deposit.reference, revenue, netResult: netResult ?? insuranceNetResult, marginPercent: computeMarginPercent(revenue, netResult ?? insuranceNetResult), employeeCount: extractEmployeeCount(accountingData.Rubrics), totalAssets: extractTotalAssets(accountingData.Rubrics), equity: extractEquity(accountingData.Rubrics) ?? insuranceEquity, cashAndInvestments: extractCashAndInvestments(accountingData.Rubrics), financialDebt: extractFinancialDebt(accountingData.Rubrics), tradeReceivables: extractTradeReceivables(accountingData.Rubrics), tradePayables: extractTradePayables(accountingData.Rubrics), fixedAssets: extractFixedAssets(accountingData.Rubrics), currentAssets: extractCurrentAssets(accountingData.Rubrics), currentLiabilities: extractCurrentLiabilities(accountingData.Rubrics), provisions: extractProvisions(accountingData.Rubrics), operatingResult: extractOperatingResult(accountingData.Rubrics), depreciation: extractDepreciation(accountingData.Rubrics), retainedEarnings: extractRetainedEarnings(accountingData.Rubrics), insuranceInvestments: insuranceValue('INS_INVESTMENTS'), unitLinkedInvestments: insuranceValue('INS_UNIT_LINKED_INVESTMENTS'), technicalProvisions: insuranceValue('INS_TECHNICAL_PROVISIONS'), lifeTechnicalProvisions: insuranceValue('INS_LIFE_TECHNICAL_PROVISIONS'), claimsProvisions: insuranceValue('INS_CLAIMS_PROVISIONS'), reinsuranceShareTechnicalProvisions: insuranceValue('INS_REINSURANCE_SHARE_TECHNICAL_PROVISIONS'), insuranceReceivables: insuranceValue('INS_RECEIVABLES'), reinsuranceDeposits: insuranceValue('INS_REINSURANCE_DEPOSITS'), currency: 'EUR', depositDate: deposit.depositDate };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response | undefined, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after');
  const seconds = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN;
  return Number.isFinite(seconds) ? seconds * 1_000 : Math.min(30_000, 2_000 * 2 ** attempt);
}

async function throttledFetch(url: string, headers: HeadersInit, fetchImpl: typeof fetch, options: PublicConsultRequestOptions): Promise<Response> {
  const requestDelayMs = Math.max(0, options.requestDelayMs ?? DEFAULT_REQUEST_DELAY_MS);
  const retries = Math.max(0, options.retries ?? DEFAULT_RETRIES);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let releaseQueue: () => void;
    const queued = requestQueue;
    requestQueue = new Promise<void>((resolve) => { releaseQueue = resolve; });
    await queued;
    let response: Response | undefined;
    try {
      response = await fetchImpl(url, { headers });
      if (response.ok) return response;
      const error = new NbbPublicConsultError(`NBB public consultation request failed (${response.status})`, response.status);
      if (response.status !== 429 && response.status !== 503) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      if (error instanceof NbbPublicConsultError && error.status !== 429 && error.status !== 503) throw error;
    } finally {
      setTimeout(releaseQueue!, requestDelayMs);
    }

    if (attempt < retries) await delay(retryDelay(response, attempt));
  }

  throw lastError instanceof Error ? lastError : new NbbPublicConsultError('NBB public consultation request failed');
}

async function getJson<T>(url: string, fetchImpl: typeof fetch, options: PublicConsultRequestOptions): Promise<T> {
  return (await throttledFetch(url, { Accept: 'application/json' }, fetchImpl, options)).json() as Promise<T>;
}

/** Reads NBB's CSV export for XBRL filings and standard coded rows from PDF-only filings. */
export async function fetchPublicConsultFinancials(enterpriseNumber: string, requestedYears: number[], fetchImpl: typeof fetch = fetch, options: PublicConsultRequestOptions = {}): Promise<{ enterpriseName?: string; years: NbbAnnualAccountSummary[] }> {
  const number = normalizeEnterpriseNumber(enterpriseNumber);
  if (number.length !== 10) throw new Error('Invalid enterprise number');
  const parameters = new URLSearchParams({ page: '0', size: '100', enterpriseNumber: number, sort: 'periodEndDate,desc', });
  const deposits = (await getJson<PublishedDepositResponse>(`${CONSULT_BASE_URL}/api/rs-consult/published-deposits?${parameters}`, fetchImpl, options)).content ?? [];
  const selected = requestedYears.map((year) => deposits.find((deposit) => deposit.periodEndDateYear === year)).filter((deposit): deposit is PublishedDeposit => deposit !== undefined);
  const enterpriseName = selected[0]?.enterpriseName;
  const years: NbbAnnualAccountSummary[] = [];

  for (const deposit of selected) {
    if (deposit.importFileType && deposit.importFileType.toUpperCase() !== 'XBRL') {
      try {
        const response = await throttledFetch(`${CONSULT_BASE_URL}/api/external/broker/public/deposits/pdf/${deposit.id}`, {}, fetchImpl, options);
        years.push(summarizeAccountingData(deposit, await parsePdfResponse(response)));
      } catch {
        years.push({ fiscalYear: deposit.periodEndDateYear, referenceNumber: deposit.reference, revenue: null, netResult: null, marginPercent: null, employeeCount: null, currency: 'EUR', depositDate: deposit.depositDate, error: 'unsupported_format' });
      }
      continue;
    }
    try {
      const response = await throttledFetch(`${CONSULT_BASE_URL}/api/external/broker/public/deposits/consult/csv/${deposit.id}`, {}, fetchImpl, options);
      const accountingData = parseCsvAccountingData(await response.text());
      years.push(summarizeAccountingData(deposit, accountingData));
    } catch {
      years.push({ fiscalYear: deposit.periodEndDateYear, referenceNumber: deposit.reference, revenue: null, netResult: null, marginPercent: null, employeeCount: null, currency: 'EUR', depositDate: deposit.depositDate, error: 'fetch_failed' });
    }
  }

  return { enterpriseName, years };
}