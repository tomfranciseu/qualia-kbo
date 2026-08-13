import { insertMany } from '../client';
import { readCsvBatches } from './csv';

type MetaRow = { Variable: string; Value: string };

export async function loadMetaCSV(filename: string): Promise<void> {
  await readCsvBatches<MetaRow, unknown[]>(filename, (row) => [row.Variable, row.Value], (batch) => insertMany('Meta', ['variable', 'value'], batch, 'ON CONFLICT ("variable") DO UPDATE SET "value" = excluded."value"'), 'Metadata');
}