import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { countEnterprisesByNacePostalCode } from './activity';
import { disconnectKboClient } from './client';

function getOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

let naceCode = process.argv[2]?.trim();
if (!naceCode || naceCode.startsWith('--')) {
  const prompt = createInterface({ input, output });
  naceCode = (await prompt.question('NACE code: ')).trim();
  prompt.close();
}
if (!naceCode) throw new Error('A NACE code is required.');

const naceVersion = getOption('--nace-version');
const classification = getOption('--classification');
const reportPath = path.resolve(getOption('--output') ?? `reports/nace-${naceCode}-postal-codes.csv`);

try {
  const rows = await countEnterprisesByNacePostalCode(naceCode, { naceVersion, classification });
  const csv = [
    'Postal code,Enterprise count',
    ...rows.map((row) => `${row.postalCode},${row.enterpriseCount}`),
  ].join('\r\n');
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `\uFEFF${csv}\r\n`, 'utf8');
  console.log(`${rows.length.toLocaleString()} postal-code groups written to ${reportPath}`);
} finally {
  await disconnectKboClient();
}