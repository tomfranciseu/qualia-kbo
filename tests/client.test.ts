import { describe, expect, it } from 'vitest';
import { checkKboDatabaseHealth } from '../src/client';

describe('checkKboDatabaseHealth', () => {
  it('returns true when the default DuckDB database can be opened', async () => {
    await expect(checkKboDatabaseHealth()).resolves.toBe(true);
  });

  it('returns true for an explicit DuckDB database path', async () => {
    const healthy = await checkKboDatabaseHealth(process.env.KBO_DATABASE_PATH);
    expect(healthy).toBe(true);
  });
});
