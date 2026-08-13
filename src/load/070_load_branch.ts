import { insertMany } from '../client';
import { parseDate } from './helper';
import { readCsvBatches } from './csv';

type BranchRow = { Id: string; StartDate: string; EnterpriseNumber: string };

export async function loadBranchCSV(filename: string, upsertMode: boolean): Promise<void> {
  await readCsvBatches<BranchRow, unknown[]>(filename, (row) => [row.Id, (parseDate(row.StartDate) ?? new Date()).toISOString(), row.EnterpriseNumber], (batch) => insertMany('Branch', ['id', 'startDate', 'enterpriseNumber'], batch, upsertMode ? 'ON CONFLICT ("id") DO UPDATE SET "startDate" = excluded."startDate", "enterpriseNumber" = excluded."enterpriseNumber"' : undefined), 'Branch');
}