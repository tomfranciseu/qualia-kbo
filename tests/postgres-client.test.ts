import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { checkKboDatabaseHealth, createKboClient, disconnectKboClient } from '../src/client';
import { lookupByEnterpriseNumber, lookupByName, lookupByVatNumber, searchEnterprisesByName } from '../src/lookup';
import { listEnterprisesByNaceCode, countEnterprisesByNacePostalCode, listEnterprisesByNaceAndPostalCode } from '../src/activity';

vi.mock('@duckdb/node-api', () => { throw new Error('PostgreSQL must not load the DuckDB native addon'); });

const postgresTestUrl = process.env.KBO_POSTGRES_TEST_URL;

afterEach(async () => { await disconnectKboClient(); vi.unstubAllEnvs(); });

describe.skipIf(!postgresTestUrl)('PostgreSQL backend (disposable database required)', () => {
  it('selects PostgreSQL from the existing URL alone and uses portable SQL for modern tables', async () => {
    vi.stubEnv('KBO_STORAGE', '');
    vi.stubEnv('KBO_DATABASE_URL', postgresTestUrl!);
    vi.stubEnv('KBO_DATABASE_PATH', '');
    // Empty path must not hide the configured PostgreSQL URL.
    delete process.env.KBO_DATABASE_PATH;
    await expect(checkKboDatabaseHealth()).resolves.toBe(true);
    const db = await createKboClient();
    expect(db.legacyPostgres).toBe(false);
    await db.run(`INSERT INTO "Enterprise" ("enterpriseNumber", "startDate") VALUES ('0200.065.765', '2020-01-02') ON CONFLICT DO NOTHING`);
    await db.run(`INSERT INTO "Denomination" ("entityNumber", "languageCode", "typeOfDenominationCode", "denomination", "enterpriseId") VALUES ('0200.065.765', 'NL', '001', 'Modern Test', '0200.065.765') ON CONFLICT DO NOTHING`);
    await db.run(`INSERT INTO "Activity" ("entityNumber", "activityGroupCode", "naceVersion", "naceCode", "classification", "enterpriseId") VALUES ('0200.065.765', '006', '2025', '62010', 'MAIN', '0200.065.765') ON CONFLICT DO NOTHING`);
    await expect(lookupByVatNumber('BE', '0200065765')).resolves.toMatchObject({ name: 'Modern Test', startDate: '2020-01-02' });
    await expect(searchEnterprisesByName('modern')).resolves.toMatchObject([{ name: 'Modern Test' }]);
    await expect(listEnterprisesByNaceCode('620', { naceVersion: '2025' })).resolves.toMatchObject({ total: 1, enterprises: [{ name: 'Modern Test' }] });
  });

  it('reads the original Prisma schema with read-only connections, without copying or altering its data', async () => {
    const admin = new Pool({ connectionString: postgresTestUrl });
    let ownsSchema = false;
    try {
      const { rows } = await admin.query(`SELECT to_regnamespace('kbo') IS NOT NULL AS exists`);
      if (rows[0].exists) throw new Error('Refusing to modify an existing kbo schema; use a disposable KBO_POSTGRES_TEST_URL');
      ownsSchema = true;
      for (const migration of ['20250605000000_init', '20260807000000_add_activity']) {
        await admin.query(readFileSync(new URL(`../prisma/migrations/${migration}/migration.sql`, import.meta.url), 'utf8'));
      }
      for (const table of ['KBOStatus', 'JuridicalSituation', 'TypeOfEnterprise', 'JuridicalForm', 'Language', 'TypeOfDenomination', 'TypeOfAddress', 'EntityContact', 'ContactType']) {
        await admin.query(`INSERT INTO kbo."${table}" (code, description) VALUES ('A', 'Active')`);
      }
      await admin.query(`INSERT INTO kbo."TypeOfAddress" VALUES ('REGO', 'Registered office')`);
      await admin.query(`INSERT INTO kbo."Enterprise" VALUES ('0123.456.789', 'A', 'A', 'A', 'A', NULL, '2020-01-02') ON CONFLICT DO NOTHING`);
      await admin.query(`INSERT INTO kbo."Denomination" (id, "entityNumber", "languageCode", "typeOfDenominationCode", denomination, "enterpriseId") VALUES ('name', '0123.456.789', 'A', 'A', 'Acme 100%_!', '0123.456.789')`);
      await admin.query(`INSERT INTO kbo."KBOAddress" (id, "entityNumber", "typeOfAddressCode", "enterpriseNumber", "municipalityNL", zipcode) VALUES ('addr', '0123.456.789', 'REGO', '0123.456.789', 'Brussel', '1000')`);
      await admin.query(`INSERT INTO kbo."KBOContact" (id, "entityNumber", "entityContactCode", "conctactTypeCode", value, "enterpriseId") VALUES ('contact', '0123.456.789', 'A', 'A', 'info@example.test', '0123.456.789')`);
      await admin.query(`INSERT INTO kbo."Activity" (id, "entityNumber", "activityGroupCode", "naceVersion", "naceCode", classification, "enterpriseId") VALUES ('activity', '0123.456.789', '006', '2025', '62010', 'MAIN', '0123.456.789')`);
      const readOnly = new URL(postgresTestUrl!);
      readOnly.searchParams.set('options', '-c default_transaction_read_only=on');
      vi.stubEnv('KBO_DATABASE_URL', readOnly.toString());
      vi.stubEnv('KBO_STORAGE', '');
      delete process.env.KBO_DATABASE_PATH;
      const clients = await Promise.all([createKboClient(), createKboClient()]);
      expect(clients.every(db => db.legacyPostgres)).toBe(true);
      await expect(checkKboDatabaseHealth()).resolves.toBe(true);
      const expected = { enterpriseNumber: '0123.456.789', name: 'Acme 100%_!', startDate: '2020-01-02', status: 'Active', addresses: [expect.objectContaining({ city: 'Brussel' })], contacts: [{ type: 'Active', value: 'info@example.test' }] };
      await expect(lookupByVatNumber('BE', '0123456789')).resolves.toMatchObject(expected);
      await expect(lookupByEnterpriseNumber('0123456789')).resolves.toMatchObject(expected);
      await expect(lookupByName('Acme 100%_!')).resolves.toMatchObject(expected);
      await expect(searchEnterprisesByName('100%_!')).resolves.toEqual([{ enterpriseNumber: '0123.456.789', name: 'Acme 100%_!', city: 'Brussel', status: 'Active' }]);
      await expect(searchEnterprisesByName("' OR 1=1 --")).resolves.toEqual([]);
      await expect(listEnterprisesByNaceCode('620', { naceVersion: '2025' })).resolves.toMatchObject({ total: 1, enterprises: [{ enterpriseNumber: '0123.456.789', startDate: '2020-01-02' }] });
      await expect(countEnterprisesByNacePostalCode('620')).resolves.toEqual([{ postalCode: '1000', enterpriseCount: 1 }]);
      await expect(listEnterprisesByNaceAndPostalCode('620', '1000')).resolves.toMatchObject([{ enterpriseNumber: '0123.456.789', postalCode: '1000', startDate: '2020-01-02' }]);
      // Public modern tables from the preceding test remain distinct and unchanged.
      await expect(admin.query('SELECT count(*) AS count FROM public."Enterprise"')).resolves.toMatchObject({ rows: [{ count: '1' }] });
    } finally {
      await disconnectKboClient();
      if (ownsSchema) await admin.query('DROP SCHEMA kbo CASCADE');
      await admin.end();
    }
  });
});
