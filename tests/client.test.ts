import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkKboDatabaseHealth, disconnectKboClient } from '../src/client';

const testDirectories: string[] = [];

afterEach(async () => {
  await disconnectKboClient();
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
});
