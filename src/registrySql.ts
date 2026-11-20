import type { KboClient } from './client';

const registryTables = ['Enterprise', 'Establishment', 'Activity', 'Denomination', 'KBOAddress', 'KBOContact', 'Code'] as const;
type RegistryTable = typeof registryTables[number];

/** Fixed SQL sources for the modern tables or the existing Prisma-managed kbo schema.
 * Identifiers never come from user input. Legacy address mappings and code tables
 * remain unchanged in PostgreSQL; these read projections normalize their shape.
 */
export function registryTable(db: KboClient, table: RegistryTable): string {
  if (!db.legacyPostgres) return `"${table}"`;
  if (table === 'KBOAddress') {
    return '(SELECT address.*, "enterpriseNumber" AS "enterpriseId", "establishmentNumber" AS "establishmentId" FROM kbo."KBOAddress" address)';
  }
  if (table === 'Code') {
    const sources = [['Status', 'KBOStatus'], ['JuridicalSituation', 'JuridicalSituation'], ['JuridicalForm', 'JuridicalForm'], ['ContactType', 'ContactType']];
    return `(${sources.map(([category, name]) => `SELECT '${category}' AS "category", "code", "description" FROM kbo."${name}"`).join(' UNION ALL ')})`;
  }
  return `kbo."${table}"`;
}
