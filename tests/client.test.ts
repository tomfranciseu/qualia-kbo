import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkKboDatabaseHealth, createKboClient, disconnectKboClient } from '../src/client';

const testDirectories: string[] = [];

afterEach(async () => {
  await disconnectKboClient();
  delete process.env.KBO_DUCKDB_ACCESS_MODE;
  await Promise.all(testDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function testDatabasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'qualia-kbo-test-'));
  testDirectories.push(directory);
  return join(directory, 'kbo.duckdb');
}

describe('checkKboDatabaseHealth', () => {
  it('returns true for an isolated DuckDB database path', async () => {
    await expect(checkKboDatabaseHealth(await testDatabasePath())).resolves.toBe(true);
  });

  it('opens an initialized database in read-only mode', async () => {
    const databasePath = await testDatabasePath();
    await createKboClient(databasePath);
    await disconnectKboClient();

    process.env.KBO_DUCKDB_ACCESS_MODE = 'read_only';
    const db = await createKboClient(databasePath);
    await expect(db.all<{ healthy: number }>('SELECT 1 AS healthy')).resolves.toEqual([{ healthy: 1 }]);
  });
});
