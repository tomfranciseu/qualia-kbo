import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectRecentDepositReferences } from '../src/nbb/references';
import {
  computeMarginPercent,
  extractNetResult,
  extractRevenue,
} from '../src/nbb/rubrics';
import { checkNbbConfigured, fetchCompanyFinancials } from '../src/nbb/financials';
import type { NbbDepositReference } from '../src/nbb/types';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const referencesFixture = JSON.parse(
  readFileSync(join(fixturesDir, 'nbb-references.json'), 'utf8')
);
const accounting2024 = JSON.parse(
  readFileSync(join(fixturesDir, 'nbb-accounting-2024.json'), 'utf8')
);
const accounting2023 = JSON.parse(
  readFileSync(join(fixturesDir, 'nbb-accounting-2023.json'), 'utf8')
);

describe('rubrics', () => {
  it('extracts revenue and net result from standard codes', () => {
    const rubrics = accounting2024.Rubrics;
    expect(extractRevenue(rubrics)).toBe(1_000_000);
    expect(extractNetResult(rubrics)).toBe(120_000);
    expect(computeMarginPercent(1_000_000, 120_000)).toBe(12);
  });

  it('returns null margin when revenue is zero', () => {
    expect(computeMarginPercent(0, 100)).toBeNull();
  });
});

describe('selectRecentDepositReferences', () => {
  it('returns the five most recent fiscal years', () => {
    type RawReference = {
      ReferenceNumber: string;
      DepositDate?: string;
      ExerciseDates?: { endDate?: string };
      EnterpriseName?: string;
    };

    const refs: NbbDepositReference[] = (referencesFixture as RawReference[]).flatMap((ref) => {
      const endDate = ref.ExerciseDates?.endDate;
      if (!endDate) return [];
      return [{
        referenceNumber: ref.ReferenceNumber,
        depositDate: ref.DepositDate,
        fiscalYear: Number.parseInt(endDate.slice(0, 4), 10),
        enterpriseName: ref.EnterpriseName,
      }];
    });

    const selected = selectRecentDepositReferences(refs, 5);
    expect(selected.map((r) => r.fiscalYear)).toEqual([2024, 2023, 2022, 2021, 2020]);
  });
});

describe('fetchCompanyFinancials', () => {
  beforeEach(() => {
    process.env.NBB_CBSO_SUBSCRIPTION_KEY = 'test-key';
    process.env.NBB_CBSO_BASE_URL = 'https://ws.cbso.nbb.be';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.NBB_CBSO_SUBSCRIPTION_KEY;
    delete process.env.NBB_CBSO_BASE_URL;
  });

  it('reports not configured without subscription key', () => {
    delete process.env.NBB_CBSO_SUBSCRIPTION_KEY;
    expect(checkNbbConfigured()).toBe(false);
  });

  it('fetches last five years and maps revenue and margin', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/legalEntity/0123456789/references')) {
        return new Response(JSON.stringify(referencesFixture), { status: 200 });
      }

      if (url.includes('/deposit/2024-00001234/accountingData')) {
        return new Response(JSON.stringify(accounting2024), { status: 200 });
      }

      if (url.includes('/deposit/2023-00005678/accountingData')) {
        return new Response(JSON.stringify(accounting2023), { status: 200 });
      }

      if (url.includes('/accountingData')) {
        return new Response('Not found', { status: 404 });
      }

      return new Response('Unexpected URL', { status: 500 });
    });

    const result = await fetchCompanyFinancials('0123.456.789', { years: 5 }, fetchMock);

    expect(result.enterpriseNumber).toBe('0123456789');
    expect(result.enterpriseName).toBe('Acme BV');
    expect(result.years).toHaveLength(5);

    const y2024 = result.years.find((y) => y.fiscalYear === 2024);
    expect(y2024?.revenue).toBe(1_000_000);
    expect(y2024?.netResult).toBe(120_000);
    expect(y2024?.marginPercent).toBe(12);

    const y2022 = result.years.find((y) => y.fiscalYear === 2022);
    expect(y2022?.error).toBe('no_json');
  });
});
