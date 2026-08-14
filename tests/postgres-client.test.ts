import { afterEach, describe, expect, it } from 'vitest';
import { checkKboDatabaseHealth, createKboClient, disconnectKboClient } from '../src/client';

const postgresTestUrl = process.env.KBO_POSTGRES_TEST_URL;

afterEach(async () => {
  await disconnectKboClient();
  delete process.env.KBO_STORAGE;
  delete process.env.KBO_DATABASE_URL;
});

describe.skipIf(!postgresTestUrl)('PostgreSQL backend', () => {
  it('initializes the schema and accepts portable queries', async () => {
    process.env.KBO_STORAGE = 'postgres';
    process.env.KBO_DATABASE_URL = postgresTestUrl;
    await expect(checkKboDatabaseHealth()).resolves.toBe(true);
    const db = await createKboClient();
    await db.run('INSERT INTO "Meta" ("variable", "value") VALUES ($1, $2) ON CONFLICT ("variable") DO UPDATE SET "value" = excluded."value"', ['backend-test', 'postgres']);
    await expect(db.all<{ value: string }>('SELECT "value" FROM "Meta" WHERE "variable" = $1', ['backend-test'])).resolves.toEqual([{ value: 'postgres' }]);
  });
});