import { describe, expect, it } from 'vitest';
import { buildNaceActivityWhere, listEnterprisesByNaceCode } from '../src/activity';
import { rowToActivityInput } from '../src/load/080_load_activity';

describe('rowToActivityInput', () => {
  it('links enterprise-dotted EntityNumber to enterpriseId', () => {
    expect(
      rowToActivityInput({
        EntityNumber: '0200.065.765',
        ActivityGroup: '006',
        NaceVersion: '2025',
        NaceCode: '84130',
        Classification: 'MAIN',
      }),
    ).toEqual({
      entityNumber: '0200.065.765',
      activityGroupCode: '006',
      naceVersion: '2025',
      naceCode: '84130',
      classification: 'MAIN',
      enterpriseId: '0200.065.765',
    });
  });

  it('links establishment-dotted EntityNumber to establishmentId', () => {
    expect(
      rowToActivityInput({
        EntityNumber: '2.000.000.339',
        ActivityGroup: '006',
        NaceVersion: '2008',
        NaceCode: '33110',
        Classification: 'MAIN',
      }),
    ).toEqual({
      entityNumber: '2.000.000.339',
      activityGroupCode: '006',
      naceVersion: '2008',
      naceCode: '33110',
      classification: 'MAIN',
      establishmentId: '2.000.000.339',
    });
  });

  it('leaves branch numbers unlinked', () => {
    expect(
      rowToActivityInput({
        EntityNumber: '9.000.006.626',
        ActivityGroup: '001',
        NaceVersion: '2025',
        NaceCode: '62010',
        Classification: 'SECO',
      }).enterpriseId,
    ).toBeUndefined();
  });
});

describe('buildNaceActivityWhere', () => {
  it('includes optional version and classification filters', () => {
    expect(buildNaceActivityWhere('62010', { naceVersion: '2025', classification: 'MAIN' })).toEqual({
      naceCode: '62010',
      naceVersion: '2025',
      classification: 'MAIN',
    });
  });
});

describe('listEnterprisesByNaceCode', () => {
  it('returns empty for blank code without querying', async () => {
    await expect(listEnterprisesByNaceCode('  ')).resolves.toEqual({ enterprises: [], total: 0 });
  });

  it('lists enterprises when Activity table is loaded', async () => {
    if (!process.env.KBO_DATABASE_URL) return;
    const result = await listEnterprisesByNaceCode('70200', {
      naceVersion: '2025',
      classification: 'MAIN',
      limit: 5,
    });
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.enterprises.length).toBeLessThanOrEqual(5);
    for (const hit of result.enterprises) {
      expect(hit.enterpriseNumber).toMatch(/^\d{4}\.\d{3}\.\d{3}$/);
      expect(hit.naceCodes).toContain('70200');
    }
  }, 30_000);
});
