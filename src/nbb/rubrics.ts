import type { NbbRubric } from './types';

/** Primary turnover rubric in Belgian abbreviated annual accounts. */
const REVENUE_CODES = ['70', '700', '7000', '701', '7010'] as const;

/** Result of the financial year rubrics (profit/loss for the period). */
const NET_RESULT_CODES = ['9904', '990', '9900', '9087', '9047'] as const;

function parseRubricValue(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function findRubricValue(rubrics: NbbRubric[], codes: readonly string[]): number | null {
  const currentPeriod = rubrics.filter((r) => !r.Period || r.Period === 'N');

  for (const code of codes) {
    const match = currentPeriod.find((r) => r.Code === code);
    const value = parseRubricValue(match?.Value);
    if (value !== null) return value;
  }

  return null;
}

export function extractRevenue(rubrics: NbbRubric[] | undefined): number | null {
  if (!rubrics?.length) return null;
  return findRubricValue(rubrics, REVENUE_CODES);
}

export function extractNetResult(rubrics: NbbRubric[] | undefined): number | null {
  if (!rubrics?.length) return null;
  return findRubricValue(rubrics, NET_RESULT_CODES);
}

export function computeMarginPercent(
  revenue: number | null,
  netResult: number | null
): number | null {
  if (revenue === null || netResult === null || revenue === 0) return null;
  return Math.round((netResult / revenue) * 10000) / 100;
}
