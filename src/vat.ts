/**
 * Normalize a Belgian VAT number to a 10-digit enterprise number (no dots).
 */
export function getBelgianEnterpriseNumberFromVat(vatNumber: string): string | null {
  if (!vatNumber) return null;

  const digits = vatNumber.replaceAll(/\D/g, '');
  if (!digits) return null;

  const tenDigits = digits.length === 9 ? `0${digits}` : digits;
  if (tenDigits.length !== 10) return null;
  if (tenDigits[0] !== '0' && tenDigits[0] !== '1') return null;

  return tenDigits;
}

/**
 * Format a 10-digit enterprise number to KBO dotted notation (XXXX.XXX.XXX).
 */
export function formatEnterpriseNumber(digits: string): string {
  const clean = digits.replaceAll(/\D/g, '');
  if (clean.length !== 10) return digits;
  return `${clean.slice(0, 4)}.${clean.slice(4, 7)}.${clean.slice(7, 10)}`;
}
