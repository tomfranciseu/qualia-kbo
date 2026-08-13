export function parseDate(dateString: string | null): Date | undefined {
  if (!dateString) return;
  const [day, month, year] = dateString.split('-').map((part) => Number.parseInt(part, 10));
  return new Date(Date.UTC(year, month - 1, day));
}

export function determineEntityType(
  entityNumber: string,
): 'Enterprise' | 'Establishment' | 'Branch' | 'Unknown' {
  const enterprisePattern = /^\d{4}\.\d{3}\.\d{3}$/;
  const establishmentPattern = /^\d\.\d{3}\.\d{3}\.\d{3}$/;

  if (enterprisePattern.test(entityNumber)) {
    return 'Enterprise';
  }
  if (establishmentPattern.test(entityNumber)) {
    // KBO branch units use 9.x.x.x numbers and live in Branch, not Establishment.
    if (entityNumber.startsWith('9.')) {
      return 'Branch';
    }
    return 'Establishment';
  }
  return 'Unknown';
}
