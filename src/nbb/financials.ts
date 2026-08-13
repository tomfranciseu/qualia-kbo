import { fetchAccountingData } from './accountingData';
import { getNbbClientConfig } from './client';
import { NbbApiError } from './client';
import { fetchDepositReferences, selectRecentDepositReferences } from './references';
import {
  computeMarginPercent,
  extractEmployeeCount,
  extractNetResult,
  extractRevenue,
} from './rubrics';
import type {
  FetchCompanyFinancialsOptions,
  NbbAnnualAccountSummary,
  NbbFinancialLookupResult,
} from './types';

export function checkNbbConfigured(): boolean {
  return getNbbClientConfig() !== null;
}

export async function fetchCompanyFinancials(
  enterpriseNumber: string,
  options: FetchCompanyFinancialsOptions = {},
  fetchImpl: typeof fetch = fetch
): Promise<NbbFinancialLookupResult> {
  const years = options.years ?? 5;
  const normalized = enterpriseNumber.replaceAll(/\D/g, '');

  if (normalized.length !== 10) {
    throw new Error('Invalid enterprise number');
  }

  if (!checkNbbConfigured()) {
    throw new Error('NBB CBSO not configured');
  }

  const requestOptions = { retries: options.retries, timeoutMs: options.timeoutMs };
  const references = await fetchDepositReferences(normalized, fetchImpl, requestOptions);
  const requestedFiscalYears = options.fiscalYears ?? (options.fiscalYear === undefined ? undefined : [options.fiscalYear]);
  const selected = requestedFiscalYears === undefined
    ? selectRecentDepositReferences(references, years)
    : selectRecentDepositReferences(references.filter((reference) => requestedFiscalYears.includes(reference.fiscalYear)), requestedFiscalYears.length);

  const summaries: NbbAnnualAccountSummary[] = [];
  let enterpriseName: string | undefined;

  for (const ref of selected) {
    if (ref.enterpriseName && !enterpriseName) {
      enterpriseName = ref.enterpriseName;
    }

    try {
      const accountingData = await fetchAccountingData(ref.referenceNumber, fetchImpl, requestOptions);

      if (!accountingData?.Rubrics?.length) {
        summaries.push({
          fiscalYear: ref.fiscalYear,
          referenceNumber: ref.referenceNumber,
          revenue: null,
          netResult: null,
          marginPercent: null,
          employeeCount: null,
          currency: 'EUR',
          depositDate: ref.depositDate,
          error: 'no_json',
        });
        continue;
      }

      if (accountingData.EnterpriseName && !enterpriseName) {
        enterpriseName = accountingData.EnterpriseName;
      }

      const revenue = extractRevenue(accountingData.Rubrics);
      const netResult = extractNetResult(accountingData.Rubrics);
      const employeeCount = extractEmployeeCount(accountingData.Rubrics);

      summaries.push({
        fiscalYear: ref.fiscalYear,
        referenceNumber: ref.referenceNumber,
        revenue,
        netResult,
        marginPercent: computeMarginPercent(revenue, netResult),
        employeeCount,
        currency: 'EUR',
        depositDate: ref.depositDate,
      });
    } catch (error) {
      summaries.push({
        fiscalYear: ref.fiscalYear,
        referenceNumber: ref.referenceNumber,
        revenue: null,
        netResult: null,
        marginPercent: null,
        employeeCount: null,
        currency: 'EUR',
        depositDate: ref.depositDate,
        error: error instanceof NbbApiError && error.status === 415 ? 'unsupported_format' : 'fetch_failed',
      });
    }
  }

  return {
    enterpriseNumber: normalized,
    enterpriseName,
    years: summaries,
  };
}
