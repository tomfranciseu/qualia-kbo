import { insertMany } from '../client';
import { parseDate } from './helper';
import { readCsvBatches } from './csv';

type EstablishmentInput = { EstablishmentNumber: string; StartDate: string; EnterpriseNumber: string };

export async function loadEstablismentCSV(filename: string, upsertMode: boolean): Promise<void> {
  await readCsvBatches<EstablishmentInput, unknown[]>(filename, (row) => [row.EstablishmentNumber, (parseDate(row.StartDate) ?? new Date()).toISOString(), row.EnterpriseNumber], (batch) => insertMany('Establishment', ['establishmentNumber', 'startDate', 'enterpriseNumber'], batch, upsertMode ? 'ON CONFLICT ("establishmentNumber") DO UPDATE SET "startDate" = excluded."startDate", "enterpriseNumber" = excluded."enterpriseNumber"' : undefined), 'Establishment');
}