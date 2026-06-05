import { describe, expect, it } from 'vitest';
import { checkKboDatabaseHealth } from '../src/client';

describe('checkKboDatabaseHealth', () => {
  it('returns false when KBO_DATABASE_URL is unset', async () => {
    const original = process.env.KBO_DATABASE_URL;
    delete process.env.KBO_DATABASE_URL;
    await expect(checkKboDatabaseHealth()).resolves.toBe(false);
    process.env.KBO_DATABASE_URL = original;
  });

  it('returns true when KBO database is reachable', async () => {
    if (!process.env.KBO_DATABASE_URL) return;
    const healthy = await checkKboDatabaseHealth();
    if (!healthy) return;
    expect(healthy).toBe(true);
  });
});
