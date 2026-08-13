import { insertMany } from '../client';
import { readCsvBatches } from './csv';

type CodeRow = { Category: string; Code: string; Language: string; Description: string };
const categories = new Set(['ContactType', 'EntityContact', 'JuridicalForm', 'JuridicalSituation', 'Language', 'Status', 'TypeOfAddress', 'TypeOfDenomination', 'TypeOfEnterprise']);

export async function loadCSV_code(filename: string): Promise<void> {
  await readCsvBatches<CodeRow, unknown[]>(filename, (row) => row.Language === 'NL' && categories.has(row.Category) ? [row.Category, row.Code, row.Description] : undefined, (batch) => insertMany('Code', ['category', 'code', 'description'], batch, 'ON CONFLICT ("category", "code") DO UPDATE SET "description" = excluded."description"'), 'Code');
}