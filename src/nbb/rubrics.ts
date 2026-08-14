import type { NbbRubric } from './types';

/** Aggregate turnover (70 + 71 + 72 + 74 + 76A) in full/abbreviated annual accounts. */
const REVENUE_AGGREGATE_CODES = ['70/76A'] as const;

/** Turnover rubric codes, tried before summing components. */
const REVENUE_DIRECT_CODES = ['70', '700', '7000', '701', '7010'] as const;

/** Turnover components summed when no aggregate/direct code is present. */
const REVENUE_COMPONENT_CODES = ['70', '71', '72', '74', '76A'] as const;

/** Result of the financial year (profit/loss for the period). */
const NET_RESULT_CODES = ['9904', '990', '9900', '9047'] as const;

/** Average headcount in full-time equivalents (FTE). */
const EMPLOYEE_COUNT_CODES = ['1003', '9146'] as const;
const TOTAL_ASSETS_CODES = ['20/58'] as const;
const EQUITY_CODES = ['10/15'] as const;
const CASH_AND_INVESTMENTS_CODES = ['54/58'] as const;
const FINANCIAL_DEBT_CODES = ['17/49'] as const;
const TRADE_RECEIVABLES_CODES = ['40/41'] as const;
const TRADE_PAYABLES_CODES = ['44'] as const;
const FIXED_ASSETS_CODES = ['20/28'] as const;
const CURRENT_ASSETS_CODES = ['29/58'] as const;
const CURRENT_LIABILITIES_CODES = ['42/48'] as const;
const PROVISIONS_CODES = ['16'] as const;
const OPERATING_RESULT_CODES = ['9901'] as const;
const DEPRECIATION_CODES = ['630'] as const;
const RETAINED_EARNINGS_CODES = ['14'] as const;

function parseRubricValue(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function currentPeriodRubrics(rubrics: NbbRubric[]): NbbRubric[] {
  return rubrics.filter((r) => !r.Period || r.Period === 'N');
}

function findRubricValue(rubrics: NbbRubric[], codes: readonly string[]): number | null {
  const currentPeriod = currentPeriodRubrics(rubrics);

  for (const code of codes) {
    const match = currentPeriod.find((r) => r.Code === code);
    const value = parseRubricValue(match?.Value);
    if (value !== null) return value;
  }

  return null;
}

function sumRubricComponents(rubrics: NbbRubric[], codes: readonly string[]): number | null {
  const currentPeriod = currentPeriodRubrics(rubrics);
  let sum = 0;
  let found = false;

  for (const code of codes) {
    const match = currentPeriod.find((r) => r.Code === code);
    const value = parseRubricValue(match?.Value);
    if (value !== null) {
      sum += value;
      found = true;
    }
  }

  return found ? sum : null;
}

export function extractRevenue(rubrics: NbbRubric[] | undefined): number | null {
  if (!rubrics?.length) return null;

  const aggregate = findRubricValue(rubrics, REVENUE_AGGREGATE_CODES);
  if (aggregate !== null) return aggregate;

  const direct = findRubricValue(rubrics, REVENUE_DIRECT_CODES);
  if (direct !== null) return direct;

  return sumRubricComponents(rubrics, REVENUE_COMPONENT_CODES);
}

export function extractNetResult(rubrics: NbbRubric[] | undefined): number | null {
  if (!rubrics?.length) return null;
  return findRubricValue(rubrics, NET_RESULT_CODES);
}

export function extractEmployeeCount(rubrics: NbbRubric[] | undefined): number | null {
  if (!rubrics?.length) return null;
  const value = findRubricValue(rubrics, EMPLOYEE_COUNT_CODES);
  if (value === null) return null;
  return Math.round(value * 10) / 10;
}

export function extractTotalAssets(rubrics: NbbRubric[] | undefined): number | null {
  return rubrics?.length ? findRubricValue(rubrics, TOTAL_ASSETS_CODES) : null;
}

export function extractEquity(rubrics: NbbRubric[] | undefined): number | null {
  return rubrics?.length ? findRubricValue(rubrics, EQUITY_CODES) : null;
}

export function extractCashAndInvestments(rubrics: NbbRubric[] | undefined): number | null {
  return rubrics?.length ? findRubricValue(rubrics, CASH_AND_INVESTMENTS_CODES) : null;
}

export function extractFinancialDebt(rubrics: NbbRubric[] | undefined): number | null {
  return rubrics?.length ? findRubricValue(rubrics, FINANCIAL_DEBT_CODES) : null;
}

export function extractTradeReceivables(rubrics: NbbRubric[] | undefined): number | null {
  return rubrics?.length ? findRubricValue(rubrics, TRADE_RECEIVABLES_CODES) : null;
}

export function extractTradePayables(rubrics: NbbRubric[] | undefined): number | null {
  return rubrics?.length ? findRubricValue(rubrics, TRADE_PAYABLES_CODES) : null;
}

export function extractFixedAssets(rubrics: NbbRubric[] | undefined): number | null { return rubrics?.length ? findRubricValue(rubrics, FIXED_ASSETS_CODES) : null; }
export function extractCurrentAssets(rubrics: NbbRubric[] | undefined): number | null { return rubrics?.length ? findRubricValue(rubrics, CURRENT_ASSETS_CODES) : null; }
export function extractCurrentLiabilities(rubrics: NbbRubric[] | undefined): number | null { return rubrics?.length ? findRubricValue(rubrics, CURRENT_LIABILITIES_CODES) : null; }
export function extractProvisions(rubrics: NbbRubric[] | undefined): number | null { return rubrics?.length ? findRubricValue(rubrics, PROVISIONS_CODES) : null; }
export function extractOperatingResult(rubrics: NbbRubric[] | undefined): number | null { return rubrics?.length ? findRubricValue(rubrics, OPERATING_RESULT_CODES) : null; }
export function extractDepreciation(rubrics: NbbRubric[] | undefined): number | null { return rubrics?.length ? findRubricValue(rubrics, DEPRECIATION_CODES) : null; }
export function extractRetainedEarnings(rubrics: NbbRubric[] | undefined): number | null { return rubrics?.length ? findRubricValue(rubrics, RETAINED_EARNINGS_CODES) : null; }

export function computeMarginPercent(
  revenue: number | null,
  netResult: number | null
): number | null {
  if (revenue === null || netResult === null || revenue === 0) return null;
  return Math.round((netResult / revenue) * 10000) / 100;
}
