import { nbbGet, normalizeEnterpriseNumber } from './client';
import type { NbbDepositReference } from './types';

type ReferenceRecord = {
  ReferenceNumber?: string;
  DepositDate?: string;
  ExerciseDates?: {
    startDate?: string;
    endDate?: string;
  };
  EnterpriseName?: string;
  AccountingDataURL?: string;
};

function fiscalYearFromReference(ref: ReferenceRecord): number | null {
  const endDate = ref.ExerciseDates?.endDate;
  if (!endDate) return null;
  const year = Number.parseInt(endDate.slice(0, 4), 10);
  return Number.isFinite(year) ? year : null;
}

function toDepositReference(ref: ReferenceRecord): NbbDepositReference | null {
  const referenceNumber = ref.ReferenceNumber?.trim();
  const fiscalYear = fiscalYearFromReference(ref);
  if (!referenceNumber || fiscalYear === null) return null;

  return {
    referenceNumber,
    depositDate: ref.DepositDate,
    fiscalYear,
    enterpriseName: ref.EnterpriseName,
    accountingDataUrl: ref.AccountingDataURL,
  };
}

function extractReferenceRecords(payload: unknown): ReferenceRecord[] {
  if (Array.isArray(payload)) {
    return payload as ReferenceRecord[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['References', 'references', 'Deposits', 'deposits']) {
      const value = record[key];
      if (Array.isArray(value)) {
        return value as ReferenceRecord[];
      }
    }
  }

  return [];
}

export async function fetchDepositReferences(
  enterpriseNumber: string,
  fetchImpl: typeof fetch = fetch
): Promise<NbbDepositReference[]> {
  const normalized = normalizeEnterpriseNumber(enterpriseNumber);
  if (normalized.length !== 10) {
    throw new Error('Invalid enterprise number');
  }

  const payload = await nbbGet<unknown>(
    `/legalEntity/${normalized}/references`,
    fetchImpl
  );

  return extractReferenceRecords(payload)
    .map(toDepositReference)
    .filter((ref): ref is NbbDepositReference => ref !== null);
}

export function selectRecentDepositReferences(
  references: NbbDepositReference[],
  years: number
): NbbDepositReference[] {
  const byYear = new Map<number, NbbDepositReference>();

  for (const ref of references) {
    const existing = byYear.get(ref.fiscalYear);
    if (!existing) {
      byYear.set(ref.fiscalYear, ref);
      continue;
    }

    const existingDate = existing.depositDate ?? '';
    const candidateDate = ref.depositDate ?? '';
    if (candidateDate > existingDate) {
      byYear.set(ref.fiscalYear, ref);
    }
  }

  return [...byYear.values()]
    .sort((a, b) => b.fiscalYear - a.fiscalYear)
    .slice(0, years);
}
