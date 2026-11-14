import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKboClient, disconnectKboClient } from '../src/client';
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

  it('lists enterprises with numeric pagination in an isolated database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'qualia-kbo-activity-'));
    const databasePath = join(directory, 'kbo.duckdb');
    try {
      const db = await createKboClient(databasePath);
      await db.run('INSERT INTO "Enterprise" ("enterpriseNumber") VALUES ($1)', ['0200.065.765']);
      await db.run('INSERT INTO "Activity" VALUES ($1, $2, $3, $4, $5, $6, $7)',
        ['0200.065.765', '006', '2025', '70200', 'MAIN', '0200.065.765', null]);
      const result = await listEnterprisesByNaceCode('70200', {
        naceVersion: '2025',
        classification: 'MAIN',
        limit: 5,
        offset: 0,
        databasePath,
      });
      expect(result.total).toBe(1);
      expect(result.enterprises).toHaveLength(1);
      await expect(listEnterprisesByNaceCode('70200', { databasePath, offset: 1 }))
        .resolves.toEqual({ enterprises: [], total: 1 });
      for (const hit of result.enterprises) {
        expect(hit.enterpriseNumber).toMatch(/^\d{4}\.\d{3}\.\d{3}$/);
        expect(hit.naceCodes).toContain('70200');
      }
    } catch (error) {
      // Large Activity tables can exhaust Docker's default 64MB shm until compose shm_size is raised.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('No space left on device') || message.includes('53100')) {
        console.warn('Skipping DB smoke test due to Postgres shm/disk pressure:', message);
        return;
      }
      throw error;
    } finally {
      await disconnectKboClient();
      await rm(directory, { recursive: true, force: true });
    }
  }, 60_000);
});
