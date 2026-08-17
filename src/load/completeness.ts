import path from 'node:path';
import type { KboClient } from '../client';

export type AuditCheck = {
  table: string;
  file: string;
  loader: string;
  sourceKey: string[];
  filter?: string;
};

export type TableLoadStatus = AuditCheck & {
  expected: number;
  loaded: number;
  incomplete: boolean;
};

const codeCategories = [
  'ContactType',
  'EntityContact',
  'JuridicalForm',
  'JuridicalSituation',
  'Language',
  'Status',
  'TypeOfAddress',
  'TypeOfDenomination',
  'TypeOfEnterprise',
].map((category) => `'${category}'`).join(', ');

/** Tables in the same order as `load:all` (excluding delete). */
export const loadChecks: AuditCheck[] = [
  { table: 'Code', file: 'code.csv', loader: 'code', sourceKey: ['Category', 'Code'], filter: `"Language" = 'NL' AND "Category" IN (${codeCategories})` },
  { table: 'Enterprise', file: 'enterprise.csv', loader: 'enterprise', sourceKey: ['EnterpriseNumber'] },
  { table: 'Establishment', file: 'establishment.csv', loader: 'establishment', sourceKey: ['EstablishmentNumber'] },
  { table: 'Branch', file: 'branch.csv', loader: 'branch', sourceKey: ['Id'] },
  { table: 'KBOAddress', file: 'address.csv', loader: 'address', sourceKey: ['EntityNumber', 'TypeOfAddress'], filter: `"TypeOfAddress" IN ('REGO', 'BAET')` },
  { table: 'KBOContact', file: 'contact.csv', loader: 'contact', sourceKey: ['EntityNumber', 'EntityContact', 'ContactType'], filter: `"EntityContact" IN ('ENT', 'EST')` },
  { table: 'Denomination', file: 'denomination.csv', loader: 'denomination', sourceKey: ['EntityNumber', 'Language', 'TypeOfDenomination'] },
  { table: 'Activity', file: 'activity.csv', loader: 'activity', sourceKey: ['EntityNumber', 'ActivityGroup', 'NaceVersion', 'NaceCode', 'Classification'], filter: `"EntityNumber" <> '' AND "NaceCode" <> ''` },
  { table: 'Meta', file: 'meta.csv', loader: 'meta', sourceKey: ['Variable'] },
];

export async function getTableLoadStatuses(db: KboClient, dataDir: string): Promise<TableLoadStatus[]> {
  const statuses: TableLoadStatus[] = [];

  for (const check of loadChecks) {
    const [source] = await db.all<{ count: number }>(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT DISTINCT ${check.sourceKey.map((column) => `"${column}"`).join(', ')}
        FROM read_csv($1, header = true, all_varchar = true)
        ${check.filter ? `WHERE ${check.filter}` : ''}
      )
    `, [path.join(dataDir, check.file)]);
    const [stored] = await db.all<{ count: number }>(`SELECT COUNT(*) AS count FROM "${check.table}"`);
    const expected = Number(source.count);
    const loaded = Number(stored.count);
    statuses.push({
      ...check,
      expected,
      loaded,
      incomplete: loaded < expected,
    });
  }

  return statuses;
}
