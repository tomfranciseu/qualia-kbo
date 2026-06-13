import { fetchAccountingData } from './accountingData';
import { getNbbClientConfig } from './client';
import { fetchDepositReferences, selectRecentDepositReferences } from './references';
import { computeMarginPercent, extractNetResult, extractRevenue } from './rubrics';
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

  const references = await fetchDepositReferences(normalized, fetchImpl);
  const selected = selectRecentDepositReferences(references, years);

  const summaries: NbbAnnualAccountSummary[] = [];
  let enterpriseName: string | undefined;

  for (const ref of selected) {
    if (ref.enterpriseName && !enterpriseName) {
      enterpriseName = ref.enterpriseName;
    }

    try {
      const accountingData = await fetchAccountingData(ref.referenceNumber, fetchImpl);

      if (!accountingData?.Rubrics?.length) {
        summaries.push({
          fiscalYear: ref.fiscalYear,
          referenceNumber: ref.referenceNumber,
          revenue: null,
          netResult: null,
          marginPercent: null,
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

      summaries.push({
        fiscalYear: ref.fiscalYear,
        referenceNumber: ref.referenceNumber,
        revenue,
        netResult,
        marginPercent: computeMarginPercent(revenue, netResult),
        currency: 'EUR',
        depositDate: ref.depositDate,
      });
    } catch {
      summaries.push({
        fiscalYear: ref.fiscalYear,
        referenceNumber: ref.referenceNumber,
        revenue: null,
        netResult: null,
        marginPercent: null,
        currency: 'EUR',
        depositDate: ref.depositDate,
        error: 'fetch_failed',
      });
    }
  }

  return {
    enterpriseNumber: normalized,
    enterpriseName,
    years: summaries,
  };
}
