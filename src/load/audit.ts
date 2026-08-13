import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKboClient, disconnectKboClient } from '../client';

type AuditCheck = {
  table: string;
  file: string;
  sourceKey: string[];
  filter?: string;
};

const dataDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
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

const checks: AuditCheck[] = [
  { table: 'Code', file: 'code.csv', sourceKey: ['Category', 'Code'], filter: `"Language" = 'NL' AND "Category" IN (${codeCategories})` },
  { table: 'Enterprise', file: 'enterprise.csv', sourceKey: ['EnterpriseNumber'] },
  { table: 'Establishment', file: 'establishment.csv', sourceKey: ['EstablishmentNumber'] },
  { table: 'KBOAddress', file: 'address.csv', sourceKey: ['EntityNumber', 'TypeOfAddress'], filter: `"TypeOfAddress" IN ('REGO', 'BAET')` },
  { table: 'KBOContact', file: 'contact.csv', sourceKey: ['EntityNumber', 'EntityContact', 'ContactType'], filter: `"EntityContact" IN ('ENT', 'EST')` },
  { table: 'Denomination', file: 'denomination.csv', sourceKey: ['EntityNumber', 'Language', 'TypeOfDenomination'] },
  { table: 'Branch', file: 'branch.csv', sourceKey: ['Id'] },
  { table: 'Activity', file: 'activity.csv', sourceKey: ['EntityNumber', 'ActivityGroup', 'NaceVersion', 'NaceCode', 'Classification'], filter: `"EntityNumber" <> '' AND "NaceCode" <> ''` },
  { table: 'Meta', file: 'meta.csv', sourceKey: ['Variable'] },
];

try {
  const db = await createKboClient();
  let hasMismatch = false;

  console.log(`${'Table'.padEnd(16)}${'Expected'.padStart(14)}${'Loaded'.padStart(14)}${'Difference'.padStart(14)}  Status`);
  for (const check of checks) {
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
    const difference = loaded - expected;
    const status = difference === 0 ? 'MATCH' : 'MISMATCH';
    hasMismatch ||= difference !== 0;
    console.log(`${check.table.padEnd(16)}${expected.toLocaleString().padStart(14)}${loaded.toLocaleString().padStart(14)}${difference.toLocaleString().padStart(14)}  ${status}`);
  }

  if (hasMismatch) process.exitCode = 1;
} finally {
  await disconnectKboClient();
}