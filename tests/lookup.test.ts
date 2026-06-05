import { describe, expect, it } from 'vitest';
import { formatEnterpriseNumber, getBelgianEnterpriseNumberFromVat } from '../src/vat.js';
import { lookupByVatNumber } from '../src/lookup.js';

describe('vat helpers', () => {
  it('normalizes Belgian VAT to enterprise number', () => {
    expect(getBelgianEnterpriseNumberFromVat('BE0123456789')).toBe('0123456789');
    expect(formatEnterpriseNumber('0123456789')).toBe('0123.456.789');
  });
});

describe('lookupByVatNumber', () => {
  it('returns null for non-BE countries', async () => {
    await expect(lookupByVatNumber('NL', '123456789')).resolves.toBeNull();
  });

  it('looks up enterprise when database is configured', async () => {
    if (!process.env.KBO_DATABASE_URL) return;
    const result = await lookupByVatNumber('BE', '0123456789');
    expect(result === null || typeof result?.enterpriseNumber === 'string').toBe(true);
  });
});
