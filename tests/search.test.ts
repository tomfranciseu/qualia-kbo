import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createKboClient, disconnectKboClient } from '../src/client';
import { lookupByEnterpriseNumber, lookupByName, searchEnterprisesByName } from '../src/lookup';

let directory: string | undefined;
afterEach(async () => { await disconnectKboClient(); if (directory) await rm(directory, { recursive: true, force: true }); });

describe('enterprise search public API', () => {
  it('returns no hits for blank input without requiring a database', async () => {
    await expect(searchEnterprisesByName('  ')).resolves.toEqual([]);
  });

  it('deduplicates name matches, selects the Dutch name, and bounds numeric pagination', async () => {
    directory = await mkdtemp(join(tmpdir(), 'kbo-search-'));
    const databasePath = join(directory, 'test.duckdb');
    const db = await createKboClient(databasePath);
    await db.run(`INSERT INTO "Enterprise" ("enterpriseNumber", "startDate") VALUES ('0123.456.789', '2020-01-02'), ('0987.654.321', '2021-02-03')`);
    await db.run(`INSERT INTO "Denomination" ("entityNumber", "languageCode", "typeOfDenominationCode", denomination, "enterpriseId") VALUES
      ('0123.456.789', 'FR', '001', 'Acme Français', '0123.456.789'),
      ('0123.456.789', 'NL', '001', 'Acme 100%_!', '0123.456.789'),
      ('0987.654.321', 'NL', '001', 'Acme Other', '0987.654.321')`);
    const result = await searchEnterprisesByName(' aCME ', { databasePath });
    expect(result).toEqual([{ enterpriseNumber: '0123.456.789', name: 'Acme 100%_!' }, { enterpriseNumber: '0987.654.321', name: 'Acme Other' }]);
    await expect(searchEnterprisesByName('acme', { databasePath, limit: 1.9 })).resolves.toEqual([result[0]]);
    await expect(searchEnterprisesByName('100%_!', { databasePath })).resolves.toEqual([result[0]]);
    await expect(searchEnterprisesByName("' OR 1=1 --", { databasePath })).resolves.toEqual([]);
    await expect(lookupByEnterpriseNumber('0123456789', databasePath)).resolves.toMatchObject({ name: 'Acme 100%_!', startDate: '2020-01-02' });
    await expect(lookupByName('100%_!', databasePath)).resolves.toMatchObject({ enterpriseNumber: '0123.456.789' });
  });
});
